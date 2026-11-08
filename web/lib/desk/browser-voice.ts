/** Browser speech recognition. Spoken replies are Deepgram Aura-2, not speechSynthesis. */
import type { Lang } from "./types";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type RecognitionConstructor = new () => Recognition;
export type CaptureResult = { text: string; error: string | null; aborted: boolean };
export type VoiceCapture = { result: Promise<CaptureResult>; stop(): void; abort(): void };

export function speechRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser, or type a note.",
  "service-not-allowed": "Your browser blocked speech recognition. Type a note or use a demo line.",
  "audio-capture": "No microphone is available. Connect one or type a note.",
  "no-speech": "Didn't hear any speech. Hold the button while you talk, then release.",
  network: "The browser speech service is unavailable. Type a note or use a demo line.",
};

/** stop waits for final results; abort discards them and detaches all callbacks. */
export function captureSpeech(language: string, Constructor = speechRecognition()): VoiceCapture {
  if (!Constructor) throw new Error("Speech recognition is unavailable in this browser. Try Chrome or Edge, or type a note.");
  const recognition = new Constructor();
  recognition.lang = language;
  recognition.continuous = true;
  recognition.interimResults = true;
  let text = "";
  let started = false;
  let finished = false;
  let stopping = false;
  let finishTimer: ReturnType<typeof setTimeout>;
  let limitTimer: ReturnType<typeof setTimeout>;
  let resolve: (result: CaptureResult) => void;
  const result = new Promise<CaptureResult>((done) => { resolve = done; });
  const finish = (error: string | null = null, aborted = false) => {
    if (finished) return;
    finished = true;
    clearTimeout(finishTimer);
    clearTimeout(limitTimer);
    recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
    resolve({ text: aborted ? "" : text.trim().slice(0, 600), error, aborted });
  };
  const abort = () => {
    finish(null, true);
    try { recognition.abort(); } catch { /* Already disconnected. */ }
  };
  const stop = () => {
    if (finished || stopping) return;
    stopping = true;
    // Releasing during a permission prompt must not open the microphone later.
    if (!started) return abort();
    finishTimer = setTimeout(() => {
      finish("The browser did not finish recognizing that clip. Please try again.");
      try { recognition.abort(); } catch { /* Already disconnected. */ }
    }, 4000);
    try { recognition.stop(); }
    catch { abort(); }
  };
  recognition.onstart = () => { started = true; };
  recognition.onresult = (event) => {
    text = Array.from(event.results).map((part) => part[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ");
  };
  recognition.onerror = (event) => {
    finish(event.error === "aborted" ? null : ERRORS[event.error] ?? "Browser speech recognition failed. Please type a note.", event.error === "aborted");
    try { recognition.abort(); } catch { /* Already disconnected. */ }
  };
  recognition.onend = () => finish();
  limitTimer = setTimeout(stop, 60_000);
  try { recognition.start(); }
  catch { finish("The microphone could not start. Allow microphone access in your browser, or type a note."); }
  return { result, stop, abort };
}

const SPEAK_SAMPLE_RATE = 24_000;

let generation = 0;
let audioContext: AudioContext | null = null;
let sources: AudioBufferSourceNode[] = [];
let nextAt = 0;
let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

function audioContextConstructor(): (new (options?: AudioContextOptions) => AudioContext) | null {
  if (typeof window === "undefined") return null;
  const browser = window as typeof window & { webkitAudioContext?: new (options?: AudioContextOptions) => AudioContext };
  return window.AudioContext ?? browser.webkitAudioContext ?? null;
}

export function canPlaySpoken(): boolean {
  return audioContextConstructor() !== null;
}

/** Call from the click or key that leads to a reply so the first chunk can play immediately. */
export function primeSpokenAudio(): void {
  const Context = audioContextConstructor();
  if (!Context) return;
  if (!audioContext) audioContext = new Context({ latencyHint: "interactive" });
  if (audioContext.state === "suspended") void audioContext.resume();
}

export function cancelSpeech(): void {
  generation += 1;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  reader?.cancel().catch(() => undefined);
  reader = null;
  for (const source of sources) {
    try { source.stop(); } catch { /* Already finished. */ }
  }
  sources = [];
  nextAt = 0;
}

function takeSamples(pending: Uint8Array, incoming: Uint8Array): { samples: Int16Array; pending: Uint8Array } {
  const merged = new Uint8Array(pending.length + incoming.length);
  merged.set(pending);
  merged.set(incoming, pending.length);
  const even = merged.length - (merged.length % 2);
  const pcm = new Uint8Array(even);
  pcm.set(merged.subarray(0, even));
  return { samples: new Int16Array(pcm.buffer), pending: merged.subarray(even) };
}

function schedule(ctx: AudioContext, samples: Int16Array, rate: number): void {
  if (!samples.length) return;
  const buffer = ctx.createBuffer(1, samples.length, rate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32_768;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  const startAt = Math.max(ctx.currentTime, nextAt);
  source.start(startAt);
  nextAt = startAt + buffer.duration;
  sources.push(source);
}

/** Play Deepgram audio as the first samples arrive. Never waits for the whole line, and never uses speechSynthesis. */
export async function speakWithPersonality(text: string, lang: Lang, onError: () => void): Promise<boolean> {
  cancelSpeech();
  const mine = generation;
  const spoken = text.trim();
  let started = false;
  try {
    primeSpokenAudio();
    if (!spoken || !audioContext) {
      if (spoken) onError();
      return false;
    }
    const ctx = audioContext;
    const responsePromise = fetch("/api/desk/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken.slice(0, 1000), lang }),
    });
    if (ctx.state === "suspended") await ctx.resume();
    const response = await responsePromise;
    if (mine !== generation) return false;
    if (!response.ok || !response.body) throw new Error("Deepgram voice unavailable");
    const headerRate = Number(response.headers.get("x-audio-sample-rate"));
    const rate = [8_000, 16_000, 24_000, 32_000, 48_000].includes(headerRate) ? headerRate : SPEAK_SAMPLE_RATE;
    reader = response.body.getReader();
    let pending = new Uint8Array(0);
    while (mine === generation) {
      const { done, value } = await reader.read();
      if (mine !== generation) return false;
      if (done) break;
      if (!value?.byteLength) continue;
      const split = takeSamples(pending, value);
      pending = split.pending;
      if (!split.samples.length) continue;
      schedule(ctx, split.samples, rate);
      started = true;
    }
    if (!started) throw new Error("empty audio");
    return mine === generation;
  } catch {
    if (mine !== generation) return false;
    if (started) return true;
    onError();
    return false;
  }
}
