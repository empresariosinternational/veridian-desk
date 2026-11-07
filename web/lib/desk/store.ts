/**
 * Desk state: one JSON document plus the committed seed. No database, no
 * login, no user table.
 *
 * - "file" mode (laptop, default): web/data/desk-state.json, gitignored.
 *   Writes are serialized and atomic (temp file, rename). The hardware node
 *   polls this state.
 * - "client" mode (Vercel, automatic): serverless instances share no disk,
 *   so the browser holds the JSON (localStorage, like the on-device CRM) and
 *   sends it with each request. The server applies the same tools and
 *   returns the new state. Every visitor gets their own desk.
 */

import { promises as fs } from "fs";
import path from "path";
import { createSeedState } from "./seed";
import { PROFILE_IDS, type DeskState } from "./types";

export type StateMode = "file" | "client";

/** DESK_STATE_MODE overrides; otherwise "client" on Vercel and "file" everywhere else. */
export function stateMode(): StateMode {
  const m = process.env.DESK_STATE_MODE?.trim();
  if (m === "file" || m === "client") return m;
  return process.env.VERCEL ? "client" : "file";
}

type Shared = { chain: Promise<unknown>; memory: DeskState | null; persistOk: boolean };

const g = globalThis as unknown as { __veridianDesk?: Shared };
const shared: Shared = (g.__veridianDesk ??= { chain: Promise.resolve(), memory: null, persistOk: true });

export function statePath(): string {
  return process.env.DESK_STATE_PATH || path.join(process.cwd(), "data", "desk-state.json");
}

async function load(): Promise<DeskState> {
  if (!shared.persistOk && shared.memory) return shared.memory;
  try {
    const raw = await fs.readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as DeskState;
    if (parsed?.version !== 1 || !parsed.node || !parsed.profiles) throw new Error("bad state");
    return parsed;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code && code !== "ENOENT") shared.persistOk = false;
    return shared.memory ?? createSeedState();
  }
}

async function save(state: DeskState): Promise<void> {
  shared.memory = state;
  try {
    const file = statePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 1), "utf8");
    await fs.rename(tmp, file);
    shared.persistOk = true;
  } catch {
    shared.persistOk = false;
  }
}

function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = shared.chain.then(job, job);
  shared.chain = run.catch(() => undefined);
  return run;
}

export function readState(): Promise<DeskState> {
  return serialize(load);
}

/** Read, mutate in place, write. `fn` may return `false` to skip the write. */
export function mutate<T>(fn: (s: DeskState) => T): Promise<{ state: DeskState; result: T }> {
  return serialize(async () => {
    const state = await load();
    const result = fn(state);
    if ((result as unknown) !== false) await save(state);
    return { state, result };
  });
}

export function resetState(): Promise<DeskState> {
  return serialize(async () => {
    const fresh = createSeedState();
    await save(fresh);
    return fresh;
  });
}

export function persistenceOk(): boolean {
  return shared.persistOk;
}

const LIST_KEYS = [
  "feed",
  "notes",
  "mentees",
  "calls",
  "families",
  "donors",
  "workshops",
  "hours",
  "shifts",
  "recruits",
  "standingRoles",
  "colonies",
  "needs",
  "matches",
  "grants",
  "drafts",
] as const;

/** Accept a browser-held state only if it has the desk's shape; otherwise the caller starts from the seed. */
export function parseClientState(x: unknown): DeskState | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown> & Partial<DeskState>;
  if (s.version !== 1 || !s.node || typeof s.node.status !== "string" || !Array.isArray(s.node.log)) return null;
  if (!s.profiles || !s.orgs || !s.ledger || !s.filed || !s.voiceGuide) return null;
  if (LIST_KEYS.some((k) => !Array.isArray(s[k]))) return null;
  if (PROFILE_IDS.some((id) => !s.profiles?.[id]?.preferences)) return null;
  return s as DeskState;
}

export type DeskHandle = {
  mode: StateMode;
  mutate<T>(fn: (s: DeskState) => T): Promise<{ state: DeskState; result: T }>;
  read(): Promise<DeskState>;
  reset(): Promise<DeskState>;
};

/** One request's view of the desk: the JSON file in file mode, the browser's copy in client mode. */
export function openDesk(clientState?: unknown): DeskHandle {
  if (stateMode() === "client") {
    let s = parseClientState(clientState) ?? createSeedState();
    return {
      mode: "client",
      mutate: async <T>(fn: (st: DeskState) => T) => ({ state: s, result: fn(s) }),
      read: async () => s,
      reset: async () => (s = createSeedState()),
    };
  }
  return { mode: "file", mutate, read: readState, reset: resetState };
}
