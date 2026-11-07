/**
 * Deepgram is the desk's voice: it hears the utterance and speaks the
 * confirmation. Server-only — the browser never sees the key.
 *
 * Verified against developers.deepgram.com (Nov 2026):
 *   POST https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true
 *        &detect_language=en&detect_language=es&keyterm=…
 *   POST https://api.deepgram.com/v1/speak?model=aura-2-thalia-en  (JSON {"text"}; MP3 by default)
 * Haitian Creole (ht) is not offered by any Deepgram speech-to-text model,
 * so Creole notes are entered by staff.
 */

import type { Lang } from "./types";

// DEEPGRAM_API_BASE is only for a self-hosted Deepgram or a local mock in tests.
const BASE = (process.env.DEEPGRAM_API_BASE || "https://api.deepgram.com").replace(/\/$/, "");
const LISTEN_URL = `${BASE}/v1/listen`;
const SPEAK_URL = `${BASE}/v1/speak`;

export const CREOLE_LIVE = false;

/** Names the room will say. Keyterm prompting lifts recall for proper nouns. */
const KEYTERMS = [
  "Tidepath",
  "Veridian",
  "Marisol",
  "Denise",
  "Yesenia",
  "Reginald",
  "Owen",
  "Claudette",
  "Beatriz",
  "Mangrove Mews",
  "Edison Elementary",
  "West Little River",
  "Little Havana",
  "María González",
  "Give Miami Day",
  "Colony B",
];

export function deepgramKey(): string | null {
  const k = process.env.DEEPGRAM_API_KEY?.trim();
  return k ? k : null;
}

export class VoiceError extends Error {
  constructor(
    message: string,
    public readonly kind: "missing-key" | "timeout" | "http" | "empty",
  ) {
    super(message);
  }
}

function listenUrl(withKeyterms: boolean): string {
  const p = new URLSearchParams({ model: "nova-3", smart_format: "true", punctuate: "true" });
  p.append("detect_language", "en");
  p.append("detect_language", "es");
  if (withKeyterms) for (const k of KEYTERMS) p.append("keyterm", k);
  return `${LISTEN_URL}?${p.toString()}`;
}

type ListenResponse = {
  results?: {
    channels?: { detected_language?: string; language_confidence?: number; alternatives?: { transcript?: string; confidence?: number }[] }[];
  };
};

export async function transcribe(audio: Buffer, mimeType: string, timeoutMs = 12_000): Promise<{ transcript: string; lang: Lang; confidence: number | null }> {
  const key = deepgramKey();
  if (!key) throw new VoiceError("voice key missing", "missing-key");
  const attempt = async (withKeyterms: boolean) =>
    fetch(listenUrl(withKeyterms), {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": mimeType || "audio/webm" },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(timeoutMs),
    });
  let res: Response;
  try {
    res = await attempt(true);
    // If a model build rejects keyterms with language detection, retry plainly once.
    if (res.status === 400) res = await attempt(false);
  } catch (e) {
    const name = (e as Error)?.name;
    throw new VoiceError("Deepgram did not answer in time", name === "TimeoutError" || name === "AbortError" ? "timeout" : "http");
  }
  if (!res.ok) throw new VoiceError(`Deepgram listen HTTP ${res.status}`, "http");
  const data = (await res.json()) as ListenResponse;
  const ch = data.results?.channels?.[0];
  const transcript = ch?.alternatives?.[0]?.transcript?.trim() ?? "";
  if (!transcript) throw new VoiceError("No speech heard", "empty");
  const detected = (ch?.detected_language ?? "en").slice(0, 2);
  return { transcript, lang: detected === "es" ? "es" : "en", confidence: ch?.alternatives?.[0]?.confidence ?? null };
}

export function voiceFor(lang: Lang): string {
  if (lang === "es") return process.env.DEEPGRAM_VOICE_ES?.trim() || "aura-2-celeste-es";
  return process.env.DEEPGRAM_VOICE_EN?.trim() || "aura-2-thalia-en";
}

export async function speak(text: string, lang: Lang, timeoutMs = 6_000): Promise<{ audioBase64: string; mimeType: string }> {
  const key = deepgramKey();
  if (!key) throw new VoiceError("voice key missing", "missing-key");
  const url = `${SPEAK_URL}?${new URLSearchParams({ model: voiceFor(lang), encoding: "mp3" }).toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 400) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new VoiceError("Deepgram speak timed out", name === "TimeoutError" || name === "AbortError" ? "timeout" : "http");
  }
  if (!res.ok) throw new VoiceError(`Deepgram speak HTTP ${res.status}`, "http");
  const buf = Buffer.from(await res.arrayBuffer());
  return { audioBase64: buf.toString("base64"), mimeType: res.headers.get("content-type") || "audio/mpeg" };
}
