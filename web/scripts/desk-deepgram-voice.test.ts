/** Aura-2 personality is required. Browser speechSynthesis must never speak. */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "../app/api/desk/speak/route";
import { cancelSpeech, speakWithPersonality } from "../lib/desk/browser-voice";
import { assertHumanVoice, speakRequest, voiceFor } from "../lib/desk/deepgram-voice";
import type { Lang } from "../lib/desk/types";

const originalKey = process.env.DEEPGRAM_API_KEY;
const originalFetch = globalThis.fetch;
afterEach(() => {
  cancelSpeech();
  if (originalKey === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
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

test("the Deepgram request names the voice and keeps the key out of the URL", () => {
  const request = speakRequest("Anotado una vez.", "es", "test-key-not-real");
  const url = new URL(request.url);
  assert.equal(`${url.origin}${url.pathname}`, "https://api.deepgram.com/v1/speak");
  assert.equal(url.searchParams.get("model"), "aura-2-selena-es");
  assert.equal(url.searchParams.get("encoding"), "mp3");
  assert.equal(url.search, "?model=aura-2-selena-es&encoding=mp3");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.body, JSON.stringify({ text: "Anotado una vez." }));
  const headers = request.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Token test-key-not-real");
  assert.equal(url.searchParams.has("api_key"), false);
  assert.ok(!request.url.includes("test-key-not-real"));
});

test("speak route returns Vesta audio and does not leak the key", async () => {
  process.env.DEEPGRAM_API_KEY = "test-key-not-real";
  const calls: { url: string; authorization: string; body: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const headers = init?.headers as Record<string, string>;
    calls.push({ url: String(input), authorization: headers.Authorization, body: String(init?.body) });
    return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  const response = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Filed once.", lang: "en" satisfies Lang }),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("x-veridian-voice"), "aura-2-vesta-en");
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3, 4]);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("model"), "aura-2-vesta-en");
  assert.equal(calls[0].authorization, "Token test-key-not-real");
  assert.equal(calls[0].body, JSON.stringify({ text: "Filed once." }));
  assert.ok(!JSON.stringify(calls[0]).includes("api_key="));
});

test("a missing key or a Deepgram failure never returns audio or the key", async () => {
  delete process.env.DEEPGRAM_API_KEY;
  let called = 0;
  globalThis.fetch = async () => { called += 1; return new Response("nope", { status: 500 }); };
  const missing = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Hello" }),
  }));
  assert.equal(missing.status, 503);
  assert.equal(called, 0);
  const missingBody = await missing.json();
  assert.match(missingBody.notice, /DEEPGRAM_API_KEY/);

  process.env.DEEPGRAM_API_KEY = "test-key-not-real";
  globalThis.fetch = async () => new Response(JSON.stringify({ err_msg: "test-key-not-real" }), { status: 401 });
  const failed = await POST(new Request("http://desk.local/api/desk/speak", {
    method: "POST",
    body: JSON.stringify({ text: "Hello", lang: "es" }),
  }));
  assert.equal(failed.status, 502);
  const failedBody = await failed.json();
  assert.equal(JSON.stringify(failedBody).includes("test-key-not-real"), false);
  assert.equal((await POST(new Request("http://desk.local/api/desk/speak", { method: "POST", body: JSON.stringify({ text: "" }) }))).status, 400);
});

test("playback asks for a personality voice and never calls speechSynthesis", async () => {
  const spoken: unknown[] = [];
  const requests: { url: string; body: string }[] = [];
  class FakeAudio {
    onerror: (() => void) | null = null;
    src = "";
    play() { return Promise.resolve(); }
    pause() {}
  }
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { speechSynthesis: { cancel() {}, speak(utterance: unknown) { spoken.push(utterance); } } },
  });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:veridian-voice" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body) });
    return new Response(Uint8Array.from([9, 9]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    let failures = 0;
    assert.equal(await speakWithPersonality("Anotado una vez.", "es", () => { failures += 1; }), true);
    assert.equal(failures, 0);
    assert.equal(spoken.length, 0);
    assert.equal(requests[0].url, "/api/desk/speak");
    assert.deepEqual(JSON.parse(requests[0].body), { text: "Anotado una vez.", lang: "es" });
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 503 });
    assert.equal(await speakWithPersonality("Try again.", "en", () => { failures += 1; }), false);
    assert.equal(failures, 1);
    assert.equal(spoken.length, 0);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete (globalThis as { window?: unknown }).window;
    if (previousAudio) Object.defineProperty(globalThis, "Audio", previousAudio); else delete (globalThis as { Audio?: unknown }).Audio;
    if (previousCreate) Object.defineProperty(URL, "createObjectURL", previousCreate); else delete (URL as { createObjectURL?: unknown }).createObjectURL;
    if (previousRevoke) Object.defineProperty(URL, "revokeObjectURL", previousRevoke); else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  }
});
