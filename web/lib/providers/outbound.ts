/**
 * Shared outbound rate limiter for non-Luma event providers.
 * Luma continues to use web/lib/luma-rate-limit.ts exclusively.
 */

const GAP_MS = 120;
const MAX_CONCURRENT = 4;
const FETCH_TIMEOUT_MS = 20_000;

let lastFinishAt = 0;
let inFlight = 0;
const waiters: Array<() => void> = [];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pump() {
  while (inFlight < MAX_CONCURRENT && waiters.length > 0) {
    inFlight++;
    waiters.shift()!();
  }
}

async function acquire(): Promise<void> {
  await new Promise<void>((resolve) => {
    waiters.push(async () => {
      const wait = Math.max(0, lastFinishAt + GAP_MS - Date.now());
      if (wait > 0) await sleep(wait);
      resolve();
    });
    pump();
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  lastFinishAt = Date.now();
  pump();
}

export async function providerFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  await acquire();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
    release();
  }
}
