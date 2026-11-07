import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { connectArduino, stateFrame, supportsArduino } from "../lib/desk/arduino";

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
  let triggers = 0;
  const connection = await connectArduino(() => triggers++, () => undefined);
  fixture.receive('boot\n{"event":"ready"}\nnull\n{"event":"so');
  fixture.receive('nar"}\r\n{"event":"sonar"}\n');
  fixture.receive("x".repeat(300) + '{"event":"sonar"}\n');
  fixture.receive('{"event":"sonar"}\n');
  await setImmediate();
  assert.equal(triggers, 3);
  await connection.close();
});

test("writes stay ordered and close cancels pending reads and releases both locks once", async () => {
  const fixture = serialFixture();
  let disconnected = 0;
  const connection = await connectArduino(() => undefined, () => disconnected++);
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
  const connection = await connectArduino(() => undefined, () => disconnected++);
  fixture.unplug();
  await setImmediate();
  await connection.close();
  assert.equal(fixture.closed(), 1);
  assert.equal(disconnected, 1);
});

test("a failed USB write tears down the connection without unhandled rejection", async () => {
  const fixture = serialFixture(true);
  let disconnected = 0;
  const connection = await connectArduino(() => undefined, () => disconnected++);
  await connection.sendState("ARMED", false, "Wave");
  await connection.close();
  assert.equal(fixture.closed(), 1);
  assert.equal(disconnected, 1);
});

test("missing browser serial support is detected", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  assert.equal(supportsArduino(), false);
  await assert.rejects(connectArduino(() => undefined, () => undefined), /desktop Chrome or Edge/);
});
