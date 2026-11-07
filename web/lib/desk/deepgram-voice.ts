/**
 * Spoken replies use Deepgram Aura-2, not the browser speech synthesizer.
 * The model is chosen for a human personality. Aura-1 and local browser voices
 * stay out of this path because they read as flat and robotic.
 *
 * English: Vesta — Natural, Expressive, Patient, Empathetic.
 * Spanish: Selena — Latin American, Approachable, Friendly, Calm, Positive,
 * and able to move between Spanish and English without a second voice.
 * Aura has no Haitian Creole voice, so Creole confirmations use Vesta.
 */
import type { Lang } from "./types";

const HUMAN_TRAITS = new Set([
  "natural",
  "warm",
  "caring",
  "empathetic",
  "friendly",
  "expressive",
  "calm",
  "approachable",
  "comfortable",
  "positive",
  "patient",
]);

export type SpokenVoice = {
  provider: "deepgram";
  model: string;
  name: string;
  lang: "en" | "es";
  accent: string;
  personality: readonly string[];
  why: string;
};

const ENGLISH: SpokenVoice = {
  provider: "deepgram",
  model: "aura-2-vesta-en",
  name: "Vesta",
  lang: "en",
  accent: "American",
  personality: ["Natural", "Expressive", "Patient", "Empathetic"],
  why: "A patient, expressive person at the desk, not an announcer.",
};

const SPANISH: SpokenVoice = {
  provider: "deepgram",
  model: "aura-2-selena-es",
  name: "Selena",
  lang: "es",
  accent: "Latin American",
  personality: ["Approachable", "Casual", "Friendly", "Calm", "Positive"],
  why: "A calm Miami voice that can cross between Spanish and English.",
};

export function deepgramKey(): string | null {
  return process.env.DEEPGRAM_API_KEY?.trim() || null;
}

/** Reject a voice that would sound like a generic synthesizer. */
export function assertHumanVoice(voice: SpokenVoice): void {
  if (!/^aura-2-[a-z0-9-]+-(en|es)$/.test(voice.model)) {
    throw new Error(`${voice.model} is not an Aura-2 voice.`);
  }
  const hits = voice.personality.filter((trait) => HUMAN_TRAITS.has(trait.toLowerCase()));
  if (hits.length < 2) {
    throw new Error(`${voice.name} needs a human personality. Traits were: ${voice.personality.join(", ")}.`);
  }
}

export function voiceFor(lang: Lang): SpokenVoice {
  const voice = lang === "es" ? SPANISH : ENGLISH;
  assertHumanVoice(voice);
  return voice;
}

export function speakRequest(text: string, lang: Lang, key: string): { url: string; init: RequestInit } {
  const voice = voiceFor(lang);
  const url = new URL("https://api.deepgram.com/v1/speak");
  url.searchParams.set("model", voice.model);
  url.searchParams.set("encoding", "mp3");
  return {
    url: url.toString(),
    init: {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    },
  };
}
