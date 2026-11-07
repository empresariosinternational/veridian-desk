import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { connectArduino, stateFrame, supportsArduino } from "../lib/desk/arduino";
import { captureSpeech, type VoiceCapture } from "../lib/desk/browser-voice";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

function serialFixture(writeFails = false) {
  let input: ReadableStreamDefaultController<Uint8Array>;
  const frames: string[] = [];
  let closed = 0;
  const port = {
    readable: new ReadableStream<Uint8Array>({ start(controller) { input = controller; } }),
    writable: new WritableStream<Uint8Array>({ write(bytes) {
      if (writeFails) throw new Error("USB disconnected");
      frames.push(new TextDecoder().decode(bytes));
    } }),
    async open(options: { baudRate: number }) { assert.equal(options.baudRate, 115200); },
    async close() {
      assert.equal(port.readable.locked, false);
      assert.equal(port.writable.locked, false);
      closed++;
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serial: { async requestPort() { return port; } } },
  });
  return {
    frames,
    closed: () => closed,
    receive: (text: string) => input.enqueue(new TextEncoder().encode(text)),
    unplug: () => input.error(new Error("USB disconnected")),
  };
}

test("OLED frames strip delimiters and Unicode, and fit the Uno RX buffer", () => {
  assert.equal(stateFrame("FILED", true, "Filed — María|\n"), "STATE|FILED|1|Filed - Maria  \n");
  const frame = stateFrame("LISTENING", false, "x".repeat(200));
  assert.ok(new TextEncoder().encode(frame).length < 64);
  assert.ok(frame.endsWith("\n"));
});

test("serial input accepts split and combined sonar frames, ignoring invalid/oversize input", async () => {
  const fixture = serialFixture();
  const events: string[] = [];
  const connection = await connectArduino(() => events.push("start"), () => events.push("release"), () => undefined);
  fixture.receive('boot\n{"event":"ready"}\nnull\n{"event":"so');
  fixture.receive('nar"}\r\n{"event":"sonar-release"}\n{"event":"sonar"}\n');
  fixture.receive("x".repeat(300) + '{"event":"sonar"}\n');
  fixture.receive('{"event":"sonar"}\n{"event":"sonar-rel');
  fixture.receive('ease"}\r\n');
  await setImmediate();
  assert.deepEqual(events, ["start", "release", "start", "start", "release"]);
  await connection.close();
});

test("hand-away serial event stops recognition and waits for the final transcript", async (t) => {
  class Recognition {
    static current: Recognition;
    lang = "";
    continuous = false;
    interimResults = false;
    onstart = null;
    onresult = null;
    onerror = null;
    onend = null;
    stops = 0;
    constructor() { Recognition.current = this; }
    start() { this.onstart?.(); }
    stop() { this.stops++; }
    abort() {}
  }
  const fixture = serialFixture();
  let capture: VoiceCapture;
  const connection = await connectArduino(
    () => { capture = captureSpeech("en-US", Recognition); },
    () => capture?.stop(),
    () => capture?.abort(),
  );
  t.after(async () => { capture?.abort(); await connection.close(); });
  fixture.receive('{"event":"sonar"}\n');
  await setImmediate();
  const recognition = Recognition.current;
  assert.equal(recognition.stops, 0);
  let finished = false;
  void capture.result.then(() => { finished = true; });
  // Microphone capture must not hold up the USB heartbeat or release reader.
  await connection.sendState("LISTENING", false, "Listening");
  assert.deepEqual(fixture.frames, ["STATE|LISTENING|0|Listening\n"]);
  assert.equal(finished, false);
  fixture.receive('{"event":"sonar-release"}\n{"event":"sonar-release"}\n');
  await setImmediate();
  assert.equal(recognition.stops, 1);
  assert.equal(finished, false);
  await connection.sendState("WORKING", false, "Finishing transcript");
  assert.equal(fixture.frames.length, 2);
  recognition.onresult({ results: [{ 0: { transcript: "Call the school tomorrow." } }] });
  recognition.onend();
  assert.deepEqual(await capture.result, { text: "Call the school tomorrow.", error: null, aborted: false });
});

test("writes stay ordered and close cancels pending reads and releases both locks once", async () => {
  const fixture = serialFixture();
  let disconnected = 0;
  const connection = await connectArduino(() => undefined, () => undefined, () => disconnected++);
  await Promise.all([
    connection.sendState("ARMED", false, "Wave"),
    connection.sendState("LISTENING", false, "Speak"),
  ]);
  assert.deepEqual(fixture.frames, ["STATE|ARMED|0|Wave\n", "STATE|LISTENING|0|Speak\n"]);
  await Promise.all([connection.close(), connection.close()]);
  await connection.sendState("IDLE", false, "Ignored after close");
  assert.equal(fixture.frames.length, 2);
  assert.equal(fixture.closed(), 1);
  assert.equal(disconnected, 1);
});

test("unplugging closes the port and notifies the app", async () => {
  const fixture = serialFixture();
  let disconnected = 0;
  const connection = await connectArduino(() => undefined, () => undefined, () => disconnected++);
  fixture.unplug();
  await setImmediate();
  await connection.close();
  assert.equal(fixture.closed(), 1);
  assert.equal(disconnected, 1);
});

test("a failed USB write tears down the connection without unhandled rejection", async () => {
  const fixture = serialFixture(true);
  let disconnected = 0;
  const connection = await connectArduino(() => undefined, () => undefined, () => disconnected++);
  await connection.sendState("ARMED", false, "Wave");
  await connection.close();
  assert.equal(fixture.closed(), 1);
  assert.equal(disconnected, 1);
});

test("missing browser serial support is detected", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  assert.equal(supportsArduino(), false);
  await assert.rejects(connectArduino(() => undefined, () => undefined, () => undefined), /desktop Chrome or Edge/);
});
