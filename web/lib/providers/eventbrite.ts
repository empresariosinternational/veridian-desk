import { providerFetch } from "./outbound";
import type { NormalizedEvent, ProviderStatus, SearchOpts } from "./types";

const BASE = "https://www.eventbriteapi.com/v3";

export function eventbriteStatus(): ProviderStatus {
  const configured = Boolean(process.env.EVENTBRITE_PRIVATE_TOKEN);
  return {
    id: "eventbrite",
    label: "Eventbrite",
    configured,
    mode: "org_scoped",
    blurb: configured
      ? "Org-scoped API — your organization’s events (public search retired)"
      : "Set EVENTBRITE_PRIVATE_TOKEN for your org’s events + URL resolve",
    envHint: "EVENTBRITE_PRIVATE_TOKEN",
  };
}

function authHeaders(): HeadersInit {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN!;
  return { Authorization: `Bearer ${token}` };
}

/** List upcoming events for the authenticated user's organizations. */
export async function listEventbriteOrgEvents(opts: SearchOpts = {}): Promise<NormalizedEvent[]> {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
  if (!token) return [];

  const orgsR = await providerFetch(`${BASE}/users/me/organizations/`, {
    headers: authHeaders(),
  });
  if (!orgsR.ok) throw new Error(`eventbrite orgs ${orgsR.status}`);
  const orgs = (await orgsR.json()) as { organizations?: Array<{ id: string }> };
  const orgId = orgs.organizations?.[0]?.id;
  if (!orgId) return [];

  const url = new URL(`${BASE}/organizations/${orgId}/events/`);
  url.searchParams.set("status", "live");
  url.searchParams.set("order_by", "start_asc");
  url.searchParams.set("expand", "venue");
  url.searchParams.set("page_size", String(Math.min(opts.limit ?? 12, 50)));

  const r = await providerFetch(url.toString(), { headers: authHeaders() });
  if (!r.ok) throw new Error(`eventbrite events ${r.status}`);
  const data = (await r.json()) as {
    events?: Array<{
      id: string;
      name?: { text?: string };
      url?: string;
      start?: { utc?: string };
      end?: { utc?: string };
      venue?: { name?: string; address?: { city?: string } };
    }>;
  };

  let events = (data.events ?? []).map((e) => ({
    id: `eb-${e.id}`,
    provider: "eventbrite" as const,
    externalId: e.id,
    name: e.name?.text || "Eventbrite event",
    url: e.url ?? null,
    start: e.start?.utc ?? null,
    end: e.end?.utc ?? null,
    city: e.venue?.address?.city ?? opts.city ?? null,
    venue: e.venue?.name ?? null,
  }));

  if (opts.keyword) {
    const k = opts.keyword.toLowerCase();
    events = events.filter((e) => e.name.toLowerCase().includes(k));
  }
  if (opts.city) {
    const c = opts.city.toLowerCase();
    events = events.filter((e) => (e.city || "").toLowerCase().includes(c));
  }
  return events;
}

export async function resolveEventbriteUrl(raw: string): Promise<NormalizedEvent | null> {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
  const idMatch =
    raw.match(/eventbrite\.com\/e\/[^/]*-(\d+)/i) ||
    raw.match(/eventbrite\.com\/events\/(\d+)/i) ||
    raw.match(/\/events\/(\d+)\//) ||
    raw.match(/^(\d{8,})$/);
  const id = idMatch?.[1];
  if (!id) return null;

  if (!token) {
    // Soft resolve: return URL stub so communities can still pin the link
    return {
      id: `eb-${id}`,
      provider: "eventbrite",
      externalId: id,
      name: `Eventbrite event ${id}`,
      url: raw.startsWith("http") ? raw : `https://www.eventbrite.com/e/${id}`,
      start: null,
      city: null,
    };
  }

  const r = await providerFetch(`${BASE}/events/${id}/?expand=venue`, {
    headers: authHeaders(),
  });
  if (!r.ok) return null;
  const e = (await r.json()) as {
    id: string;
    name?: { text?: string };
    url?: string;
    start?: { utc?: string };
    end?: { utc?: string };
    venue?: { name?: string; address?: { city?: string } };
  };
  return {
    id: `eb-${e.id}`,
    provider: "eventbrite",
    externalId: e.id,
    name: e.name?.text || `Eventbrite ${e.id}`,
    url: e.url ?? raw,
    start: e.start?.utc ?? null,
    end: e.end?.utc ?? null,
    city: e.venue?.address?.city ?? null,
    venue: e.venue?.name ?? null,
  };
}
