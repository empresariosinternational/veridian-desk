/** Shared response shape for desk routes (server-only). */

import { CREOLE_LIVE, deepgramKey } from "./deepgram";
import { nodeView } from "./node";
import { persistenceOk, stateMode } from "./store";
import { giveMiamiDay, todayISO } from "./time";
import { PROFILE_IDS, type DeskState, type ProfileId } from "./types";

export { PROFILE_IDS };

export function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && (PROFILE_IDS as string[]).includes(v);
}

export function deskPayload(state: DeskState, now: Date) {
  const today = todayISO(now);
  const mode = stateMode();
  return {
    state,
    node: nodeView(state, now),
    voiceReady: { key: Boolean(deepgramKey()), creoleLive: CREOLE_LIVE },
    /** "file": web/data/desk-state.json on this machine. "client": the browser holds the state (Vercel). */
    mode,
    persistence: mode === "client" ? true : persistenceOk(),
    today,
    giveMiamiDay: giveMiamiDay(today),
  };
}

export type DeskPayload = ReturnType<typeof deskPayload>;

export const NO_STORE = { "Cache-Control": "no-store" };
