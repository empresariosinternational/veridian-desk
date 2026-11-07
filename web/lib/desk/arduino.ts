/** Browser-only USB transport. Frames are newline terminated, at 115200 baud. */
type SerialPort = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};
type SerialNavigator = Navigator & { serial?: { requestPort(): Promise<SerialPort> } };

export type ArduinoConnection = {
  sendState(status: string, urgent: boolean, line: string): Promise<void>;
  close(): Promise<void>;
};

export function supportsArduino(): boolean {
  return typeof navigator !== "undefined" && Boolean((navigator as SerialNavigator).serial);
}

export function stateFrame(status: string, urgent: boolean, line: string): string {
  // Keep the entire frame below the Uno's 64-byte serial RX buffer.
  const ascii = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[—–]/g, "-").replace(/[^\x20-\x7e]|\|/g, " ").slice(0, 44);
  return `STATE|${status}|${urgent ? 1 : 0}|${ascii}\n`;
}

export async function connectArduino(onTrigger: () => void, onDisconnect: () => void): Promise<ArduinoConnection> {
  const serial = (navigator as SerialNavigator).serial;
  if (!serial) throw new Error("Connect Arduino using desktop Chrome or Edge on HTTPS or localhost.");
  // Called directly from the Connect button so the browser can show its picker.
  const port = await serial.requestPort();
  await port.open({ baudRate: 115200 });
  if (!port.readable || !port.writable) {
    await port.close();
    throw new Error("Arduino serial streams are unavailable.");
  }
  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let closing: Promise<void> | null = null;
  let closed = false;
  let writes: Promise<void> = Promise.resolve();

  const readTask = (async () => {
    let buffer = "";
    let overflow = false;
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        // Handle split frames, combined frames, CRLF, and malformed input.
        for (const char of decoder.decode(value, { stream: true })) {
          if (char === "\n") {
            if (!overflow) {
              try {
                const event = JSON.parse(buffer);
                if (!closed && event?.event === "sonar") onTrigger();
              } catch { /* Ignore boot messages or invalid frames. */ }
            }
            buffer = "";
            overflow = false;
          } else if (buffer.length < 256) buffer += char;
          else overflow = true;
        }
      }
    } catch { /* Unplugging the board rejects reader.read(). */ }
    finally {
      reader.releaseLock();
      if (!closed) void close();
    }
  })();

  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      await reader.cancel().catch(() => undefined);
      await readTask;
      await writes;
      writer.releaseLock();
      await port.close().catch(() => undefined);
      onDisconnect();
    })();
    return closing;
  }

  return {
    sendState(status, urgent, line) {
      if (closed) return Promise.resolve();
      writes = writes.then(() => closed ? undefined : writer.write(encoder.encode(stateFrame(status, urgent, line))))
        .catch(() => { void close(); });
      return writes;
    },
    close,
  };
}
