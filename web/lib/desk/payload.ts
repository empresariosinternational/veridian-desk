/** Shared response shape for desk routes (server-only). */

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
    voiceReady: { provider: "browser", requiresKey: false, creoleLive: false },
    assistantReady: { key: Boolean(openaiKey()), model: assistantModel() },
    persistence: persistenceOk(),
    today,
    giveMiamiDay: giveMiamiDay(today),
  };
}

export type DeskPayload = ReturnType<typeof deskPayload>;

export const NO_STORE = { "Cache-Control": "no-store" };
