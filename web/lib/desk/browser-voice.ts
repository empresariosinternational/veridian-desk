/** Browser speech APIs. Neither recognition nor playback needs an application API key. */
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

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function cancelSpeech(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speakInBrowser(text: string, lang: Lang, onError: () => void): boolean {
  if (!canSpeak() || !text) return false;
  cancelSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "es" ? "es-US" : lang === "ht" ? "ht-HT" : "en-US";
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.startsWith(lang));
  utterance.voice = voices.find((voice) => voice.localService) ?? voices[0] ?? null;
  utterance.onerror = (event) => {
    if (event.error !== "interrupted" && event.error !== "canceled") onError();
  };
  try { window.speechSynthesis.speak(utterance); return true; }
  catch { return false; }
}
