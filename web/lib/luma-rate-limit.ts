/**
 * Outbound rate limiting for Luma / lu.ma requests.
 * Serializes traffic with spacing, low concurrency, backoff on 429/503, and a short circuit breaker.
 */

export type LumaRequestKind = "api" | "html" | "authed";

const GAP_MS: Record<LumaRequestKind, number> = {
  // Steady-state spacing is light; the circuit breaker + per-request backoff below
  // adaptively slow us down only if Luma actually returns 429/503.
  api: 80,
  html: 120,
  authed: 100,
};

const MAX_CONCURRENT = 6;
const FETCH_TIMEOUT_MS = 28_000;
const MAX_RETRIES = 2;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 90_000;

let lastFinishAt = 0;
let inFlight = 0;
const waiters: Array<() => void> = [];

let circuitOpenUntil = 0;
let consecutiveUpstreamFailures = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number, spread = 0.2) {
  const delta = ms * spread * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(ms + delta));
}

function pumpQueue() {
  while (inFlight < MAX_CONCURRENT && waiters.length > 0) {
    inFlight++;
    const next = waiters.shift()!;
    next();
  }
}

async function acquireSlot(kind: LumaRequestKind): Promise<void> {
  const now = Date.now();
  if (now < circuitOpenUntil) {
    throw new Error(
      `Luma API cooling down — try again in ${Math.ceil((circuitOpenUntil - now) / 1000)}s`,
    );
  }

  await new Promise<void>((resolve) => {
    waiters.push(async () => {
      const gap = GAP_MS[kind];
      const wait = Math.max(0, lastFinishAt + gap - Date.now());
      if (wait > 0) await sleep(jitter(wait));
      resolve();
    });
    pumpQueue();
  });
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
  lastFinishAt = Date.now();
  pumpQueue();
}

function recordSuccess() {
  consecutiveUpstreamFailures = 0;
}

function recordFailure(status?: number) {
  if (status === 429 || status === 503 || status === 502) {
    consecutiveUpstreamFailures++;
    if (consecutiveUpstreamFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
      consecutiveUpstreamFailures = 0;
    }
  }
}

function retryAfterMs(res: Response, attempt: number): number {
  const hdr = res.headers.get("retry-after");
  if (hdr) {
    const sec = Number(hdr);
    if (!Number.isNaN(sec) && sec > 0) return sec * 1000;
  }
  return jitter(800 * 2 ** attempt, 0.3);
}

export type LumaFetchInit = RequestInit & {
  kind?: LumaRequestKind;
  /** Next.js fetch cache — only for public JSON/HTML */
  revalidate?: number;
};

/** All outbound Luma/lu.ma HTTP calls should go through this. */
function inferKind(url: string, init: LumaFetchInit): LumaRequestKind {
  if (init.kind) return init.kind;
  if (url.includes("api.luma.com")) return "authed";
  if (/luma\.com\/|lu\.ma\//.test(url) && !url.includes("/api.")) return "html";
  return "api";
}

export async function lumaFetch(url: string, init: LumaFetchInit = {}): Promise<Response> {
  const kind = inferKind(url, init);

  const { kind: _k, revalidate, ...rest } = init;
  let attempt = 0;

  while (true) {
    await acquireSlot(kind);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const fetchInit: RequestInit = {
        ...rest,
        signal: rest.signal ?? ctrl.signal,
        ...(revalidate !== undefined ? { next: { revalidate } } : {}),
      };

      const res = await fetch(url, fetchInit);

      if (res.ok) {
        recordSuccess();
        return res;
      }

      if ((res.status === 429 || res.status === 503 || res.status === 502) && attempt < MAX_RETRIES) {
        recordFailure(res.status);
        await sleep(retryAfterMs(res, attempt));
        attempt++;
        continue;
      }

      recordFailure(res.status);
      return res;
    } catch (e) {
      recordFailure();
      if (attempt < MAX_RETRIES) {
        await sleep(jitter(600 * 2 ** attempt));
        attempt++;
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
      releaseSlot();
    }
  }
}

/** Run async work on items with bounded concurrency (avoids Promise.all stampedes). */
export async function runPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = MAX_CONCURRENT,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function runOne() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }

  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => runOne()));
  return results;
}
