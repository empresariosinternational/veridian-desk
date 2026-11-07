import { providerFetch } from "./outbound";
import type { NormalizedEvent, ProviderStatus, SearchOpts } from "./types";

/**
 * Partiful has no official public API.
 * - Always: paste event URL → normalized stub / best-effort HTML title
 * - Optional: PARTIFUL_BEARER_TOKEN for user's Firebase-backed RSVPs (unstable)
 */

const FIREBASE_FN =
  process.env.PARTIFUL_FUNCTIONS_BASE ||
  "https://api.partiful.com"; // may vary; token path is opt-in/experimental

export function partifulStatus(): ProviderStatus {
  const configured = Boolean(process.env.PARTIFUL_BEARER_TOKEN);
  return {
    id: "partiful",
    label: "Partiful",
    configured: true, // URL mode always works
    mode: configured ? "live" : "url_only",
    blurb: configured
      ? "URL resolve + optional personal RSVPs (unofficial bearer)"
      : "Paste Partiful event URLs anytime; optional PARTIFUL_BEARER_TOKEN for your RSVPs",
    envHint: "PARTIFUL_BEARER_TOKEN (optional, unofficial)",
  };
}

function extractPartifulId(raw: string): string | null {
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      if (!u.hostname.includes("partiful")) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      // /e/<id> or /event/<id>
      const i = parts.findIndex((p) => p === "e" || p === "event");
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
      return parts[parts.length - 1] || null;
    }
  } catch {
    /* fall through */
  }
  if (/^[a-zA-Z0-9_-]{6,}$/.test(raw.trim())) return raw.trim();
  return null;
}

export async function resolvePartifulUrl(raw: string): Promise<NormalizedEvent | null> {
  const id = extractPartifulId(raw);
  if (!id) return null;
  const url = raw.startsWith("http") ? raw : `https://partiful.com/e/${id}`;

  // Best-effort: fetch public HTML for <title> (rate-limited). Fail soft to stub.
  try {
    const r = await providerFetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "agentscene/1.0 (+https://github.com/empresariosinternational/agentscene)",
      },
    });
    if (r.ok) {
      const html = await r.text();
      const title =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1];
      const name = (title || "Partiful event")
        .replace(/\s*[|–-]\s*Partiful.*$/i, "")
        .trim();
      return {
        id: `pf-${id}`,
        provider: "partiful",
        externalId: id,
        name,
        url,
        start: null,
        city: null,
      };
    }
  } catch {
    /* stub below */
  }

  return {
    id: `pf-${id}`,
    provider: "partiful",
    externalId: id,
    name: `Partiful ${id}`,
    url,
    start: null,
    city: null,
  };
}

/** Experimental: list user's RSVPs if bearer present (unofficial). */
export async function listPartifulRsvps(opts: SearchOpts = {}): Promise<NormalizedEvent[]> {
  const token = process.env.PARTIFUL_BEARER_TOKEN;
  if (!token) return [];

  try {
    // Endpoint names vary across reverse-engineered clients; fail soft.
    const r = await providerFetch(`${FIREBASE_FN}/getMyUpcomingEventsForHomePage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: {} }),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { result?: { events?: any[] }; events?: any[] };
    const events = data.result?.events ?? data.events ?? [];
    return events.slice(0, opts.limit ?? 12).map((e: any, i: number) => {
      const id = String(e.id || e.eventId || e.uid || i);
      return {
        id: `pf-${id}`,
        provider: "partiful" as const,
        externalId: id,
        name: e.title || e.name || "Partiful event",
        url: e.url || e.shareUrl || `https://partiful.com/e/${id}`,
        start: e.startDate || e.startsAt || e.start || null,
        city: e.city || e.location?.city || opts.city || null,
        venue: e.venue || e.location?.name || null,
      };
    });
  } catch {
    return [];
  }
}
