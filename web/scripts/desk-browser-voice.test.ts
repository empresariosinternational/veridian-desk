import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { captureSpeech, speechRecognition, type VoiceCapture } from "../lib/desk/browser-voice";

class FakeRecognition {
  static current: FakeRecognition;
  lang = "";
  continuous = false;
  interimResults = false;
  onstart = null;
  onresult = null;
  onerror = null;
  onend = null;
  stops = 0;
  aborts = 0;
  constructor() { FakeRecognition.current = this; }
  start() { this.onstart?.(); }
  stop() { this.stops++; }
  abort() { this.aborts++; }
  words(...parts: string[]) { this.onresult?.({ results: parts.map((transcript) => ({ 0: { transcript } })) }); }
  end() { this.onend?.(); }
}
let capture: VoiceCapture;
afterEach(() => { capture?.abort(); });

test("release waits for final recognition results before returning a transcript", async () => {
  capture = captureSpeech("es-US", FakeRecognition);
  const recognition = FakeRecognition.current;
  assert.equal(recognition.lang, "es-US");
  assert.equal(recognition.continuous, true); assert.equal(recognition.interimResults, true);
  recognition.words("Soy");
  capture.stop();
  let done = false;
  void capture.result.then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false); assert.equal(recognition.stops, 1);
  recognition.words("Soy Luis.", "Hoy puedo manejar.");
  recognition.end();
  assert.deepEqual(await capture.result, { text: "Soy Luis. Hoy puedo manejar.", error: null, aborted: false });
});

test("Disarm/abort discards partial results and detaches late events", async () => {
  capture = captureSpeech("en-US", FakeRecognition);
  const recognition = FakeRecognition.current;
  recognition.words("Do not file this");
  capture.stop();
  capture.abort();
  recognition.words("Late result"); recognition.end();
  assert.deepEqual(await capture.result, { text: "", error: null, aborted: true });
  assert.equal(recognition.onresult, null); assert.equal(recognition.onend, null);
  assert.equal(recognition.aborts, 1);
});

test("release during a permission prompt aborts before capture can start", async () => {
  class PendingPermission extends FakeRecognition { start() {} }
  capture = captureSpeech("en-US", PendingPermission);
  capture.stop();
  assert.equal((await capture.result).aborted, true);
  assert.equal(FakeRecognition.current.aborts, 1);
  assert.equal(FakeRecognition.current.onstart, null);
});

test("recognition permission errors return a useful message without transcript submission", async () => {
  capture = captureSpeech("en-US", FakeRecognition);
  FakeRecognition.current.onerror({ error: "not-allowed" });
  const result = await capture.result;
  assert.match(result.error, /Microphone access is blocked/);
  assert.equal(result.text, ""); assert.equal(FakeRecognition.current.aborts, 1);
});

test("unsupported browsers get a text fallback", () => {
  assert.equal(speechRecognition(), null);
  assert.throws(() => captureSpeech("en-US", null), /Speech recognition is unavailable/);
});
