import { NextRequest } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** In-memory per-IP limits for our API routes (per server instance). */
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  resolve: { max: 30, windowMs: 60_000 },
  seed: { max: 8, windowMs: 60_000 },
  session: { max: 12, windowMs: 60_000 },
  "home-events": { max: 20, windowMs: 60_000 },
  zip: { max: 40, windowMs: 60_000 },
  desk: { max: 240, windowMs: 60_000 },
  "desk-hear": { max: 40, windowMs: 60_000 },
};

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "local";
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function checkApiRateLimit(req: NextRequest, route: keyof typeof LIMITS): RateLimitResult {
  const cfg = LIMITS[route];
  if (!cfg) return { ok: true };

  const ip = clientIp(req);
  const key = `${route}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + cfg.windowMs };
    buckets.set(key, b);
  }

  b.count++;
  if (b.count > cfg.max) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number) {
  return Response.json(
    { error: "rate_limited", message: "Too many requests — slow down and try again.", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/** Cap list lengths from user-controlled query params. */
export function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "string" ? parseInt(n, 10) : Number(n);
  if (Number.isNaN(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}
