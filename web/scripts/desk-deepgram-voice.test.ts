/** Aura-2 personality is required. Browser speechSynthesis must never speak. */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../app/api/desk/speak/route";
import { cancelSpeech, speakWithPersonality } from "../lib/desk/browser-voice";
import { assertHumanVoice, speakMessages, speakStreamUrl, voiceFor } from "../lib/desk/deepgram-voice";
import type { Lang } from "../lib/desk/types";

const originalKey = process.env.DEEPGRAM_API_KEY;
const originalFetch = globalThis.fetch;
afterEach(() => {
  cancelSpeech();
  if (originalKey === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
  globalThis.WebSocket = originalSocket;
  FakeSocket.mode = "audio";
});

test("English and Spanish use Aura-2 people with a human personality", () => {
  const english = voiceFor("en");
  const spanish = voiceFor("es");
  const creole = voiceFor("ht");
  for (const voice of [english, spanish, creole]) assertHumanVoice(voice);
  assert.equal(english.model, "aura-2-vesta-en");
  assert.equal(spanish.model, "aura-2-selena-es");
  assert.equal(spanish.accent, "Latin American");
  assert.equal(creole.model, english.model);
  assert.ok(english.personality.includes("Empathetic"));
  assert.ok(spanish.personality.includes("Friendly"));
  assert.equal(english.provider, "deepgram");
});

test("the Deepgram stream names the voice and keeps the key out of the URL", () => {
  const url = new URL(speakStreamUrl("es"));
  assert.equal(url.protocol, "wss:");
  assert.equal(`${url.host}${url.pathname}`, "api.deepgram.com/v1/speak");
  assert.equal(url.searchParams.get("model"), "aura-2-selena-es");
  assert.equal(url.searchParams.get("encoding"), "linear16");
  assert.equal(url.searchParams.get("sample_rate"), "24000");
  assert.equal(url.searchParams.get("speed"), "1.15");
  assert.equal(url.searchParams.has("api_key"), false);
  assert.equal(url.toString().includes("test-key-not-real"), false);
  const messages = speakMessages("Anotado una vez.");
  assert.deepEqual(messages.map((message) => JSON.parse(message)), [
    { type: "Speak", text: "Anotado una vez." },
    { type: "Flush" },
  ]);
});

test("a reply is spoken as one continuous line", () => {
  const messages = speakMessages("Filed once. The donor is on the board.").map((message) => JSON.parse(message) as { type: string; text?: string });
  assert.deepEqual(messages, [
    { type: "Speak", text: "Filed once. The donor is on the board." },
    { type: "Flush" },
  ]);
});

class FakeSocket extends EventTarget {
  static mode: "audio" | "error" | "leak" = "audio";
  static constructed = 0;
  static latest: FakeSocket | null = null;
  url: string;
  options: { headers?: Record<string, string> } | undefined;
  binaryType = "blob";
  readyState = 0;
  sent: string[] = [];
  constructor(url: string, options?: { headers?: Record<string, string> }) {
    super();
    this.url = url;
    this.options = options;
    FakeSocket.constructed += 1;
    FakeSocket.latest = this;
    queueMicrotask(() => {
      if (FakeSocket.mode === "error") {
        this.dispatchEvent(new Event("error"));
        return;
      }
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(data: string) {
    this.sent.push(data);
    const message = JSON.parse(data) as { type?: string };
    if (message.type === "Flush") {
      queueMicrotask(() => {
        if (FakeSocket.mode === "leak") {
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ description: "test-key-not-real" }) }));
          this.readyState = 3;
          this.dispatchEvent(new Event("close"));
          return;
        }
        this.dispatchEvent(new MessageEvent("message", { data: Uint8Array.from([1, 2, 3, 4]).buffer }));
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "Flushed", sequence_id: 0 }) }));
      });
    }
    if (message.type === "Close") queueMicrotask(() => { this.readyState = 3; this.dispatchEvent(new Event("close")); });
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

const originalSocket = globalThis.WebSocket;

test("speak route streams the first audio chunk and does not leak the key", async () => {
  process.env.DEEPGRAM_API_KEY = "test-key-not-real";
  FakeSocket.mode = "audio";
  FakeSocket.constructed = 0;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const response = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Filed once.", lang: "en" satisfies Lang }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/l16; rate=24000; channels=1");
  assert.equal(response.headers.get("x-audio-sample-rate"), "24000");
  assert.equal(response.headers.get("x-veridian-voice"), "aura-2-vesta-en");
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.deepEqual(Array.from(first.value ?? new Uint8Array()), [1, 2, 3, 4]);
  assert.equal(first.done, false);
  const socket = FakeSocket as unknown as { constructed: number };
  assert.equal(socket.constructed, 1);
  const opened = FakeSocket.latest;
  assert.ok(opened);
  const url = new URL(opened.url);
  assert.equal(url.searchParams.get("model"), "aura-2-vesta-en");
  assert.equal(url.searchParams.get("encoding"), "linear16");
  assert.equal(url.searchParams.get("sample_rate"), "24000");
  assert.equal(url.searchParams.get("speed"), "1.15");
  assert.equal(opened.url.includes("test-key-not-real"), false);
  assert.equal(opened.options?.headers?.Authorization, "Token test-key-not-real");
  assert.deepEqual(opened.sent.map((message) => JSON.parse(message) as { type: string; text?: string }), [
    { type: "Speak", text: "Filed once." },
    { type: "Flush" },
    { type: "Close" },
  ]);
  await reader.cancel();
});

test("a missing key or a Deepgram failure never returns audio or the key", async () => {
  delete process.env.DEEPGRAM_API_KEY;
  FakeSocket.constructed = 0;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const missing = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Hello" }),
  }));
  assert.equal(missing.status, 503);
  assert.equal(FakeSocket.constructed, 0);
  const missingBody = await missing.json();
  assert.match(missingBody.notice, /DEEPGRAM_API_KEY/);

  process.env.DEEPGRAM_API_KEY = "test-key-not-real";
  FakeSocket.mode = "leak";
  const failed = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Hello", lang: "es" }),
  }));
  assert.equal(failed.status, 502);
  const failedBody = await failed.json();
  assert.equal(JSON.stringify(failedBody).includes("test-key-not-real"), false);
  assert.equal((await POST(new Request("http://desk.local/api/desk/speak", { method: "POST", body: JSON.stringify({ text: "" }) }))).status, 400);
  globalThis.WebSocket = originalSocket;
});

test("playback starts on the first audio chunk and never calls speechSynthesis", async () => {
  const spoken: unknown[] = [];
  const requests: { url: string; body: string }[] = [];
  let plays = 0;
  let releaseRest: () => void = () => undefined;
  const rest = new Promise<void>((resolve) => { releaseRest = resolve; });
  let startedPlay: () => void = () => undefined;
  const started = new Promise<void>((resolve) => { startedPlay = resolve; });
  class FakeContext {
    state = "running";
    currentTime = 3;
    destination = {};
    resume() { return Promise.resolve(); }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      return {
        buffer: null as unknown,
        connect() {},
        start() { plays += 1; startedPlay(); },
        stop() {},
      };
    }
  }
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: FakeContext,
      speechSynthesis: { cancel() {}, speak(utterance: unknown) { spoken.push(utterance); } },
    },
  });
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body) });
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent === 0) {
          sent = 1;
          controller.enqueue(Uint8Array.of(0, 0));
          return;
        }
        await rest;
        controller.enqueue(Uint8Array.of(0, 16));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "audio/l16; rate=24000; channels=1", "X-Audio-Sample-Rate": "24000" } });
  };
  try {
    let failures = 0;
    const playing = speakWithPersonality("Anotado una vez.", "es", () => { failures += 1; });
    const began = await Promise.race([
      started.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    assert.equal(began, true);
    assert.equal(plays, 1);
    assert.equal(failures, 0);
    assert.equal(spoken.length, 0);
    releaseRest();
    assert.equal(await playing, true);
    assert.equal(plays, 2);
    assert.equal(requests[0].url, "/api/desk/speak");
    assert.deepEqual(JSON.parse(requests[0].body), { text: "Anotado una vez.", lang: "es" });
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 503 });
    assert.equal(await speakWithPersonality("Try again.", "en", () => { failures += 1; }), false);
    assert.equal(failures, 1);
    assert.equal(spoken.length, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});
