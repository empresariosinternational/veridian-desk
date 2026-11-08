/** Shared response shape for desk routes (server-only). */

import { deepgramKey, voiceFor } from "./deepgram-voice";
import { assistantModel, openaiKey } from "./openai";
import { nodeView } from "./node";
import { persistenceOk } from "./store";
import { giveMiamiDay, todayISO } from "./time";
import type { DeskState, ProfileId } from "./types";

export const PROFILE_IDS: ProfileId[] = ["marisol", "denise", "yesenia", "reginald", "owen", "claudette", "beatriz", "ana", "luis"];

export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && (PROFILE_IDS as string[]).includes(v);
}

export function deskPayload(state: DeskState, now: Date) {
  const today = todayISO(now);
  return {
    state,
    node: nodeView(state, now),
    voiceReady: {
      provider: "deepgram" as const,
      requiresKey: true,
      configured: Boolean(deepgramKey()),
      creoleLive: false,
      voices: {
        en: { name: voiceFor("en").name, model: voiceFor("en").model, personality: voiceFor("en").personality },
        es: { name: voiceFor("es").name, model: voiceFor("es").model, personality: voiceFor("es").personality },
      },
    },
    assistantReady: { key: Boolean(openaiKey()), model: assistantModel() },
    persistence: persistenceOk(),
    today,
    giveMiamiDay: giveMiamiDay(today),
  };
}

export type DeskPayload = ReturnType<typeof deskPayload>;

export const NO_STORE = { "Cache-Control": "no-store" };
