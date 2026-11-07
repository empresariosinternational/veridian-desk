/**
 * Desk state: one JSON file (web/data/desk-state.json, gitignored) plus the
 * committed seed. No database, no login, no user table.
 *
 * Writes are serialized and atomic (write temp file, rename). If the disk is
 * read-only (for example a serverless host), the desk keeps running from
 * memory instead of blanking the page.
 */

import { promises as fs } from "fs";
import path from "path";
import { createSeedState } from "./seed";
import type { DeskState } from "./types";

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
