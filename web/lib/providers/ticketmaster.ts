import { providerFetch } from "./outbound";
import type { NormalizedEvent, ProviderStatus, SearchOpts } from "./types";

const BASE = "https://app.ticketmaster.com/discovery/v2";

export function ticketmasterStatus(): ProviderStatus {
  const configured = Boolean(process.env.TICKETMASTER_API_KEY);
  return {
    id: "ticketmaster",
    label: "Ticketmaster",
    configured,
    mode: "live",
    blurb: configured
      ? "Discovery API — search by city / keyword"
      : "Set TICKETMASTER_API_KEY to enable live search",
    envHint: "TICKETMASTER_API_KEY",
  };
}

export async function searchTicketmaster(opts: SearchOpts): Promise<NormalizedEvent[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return [];

  const url = new URL(`${BASE}/events.json`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("size", String(Math.min(opts.limit ?? 12, 25)));
  url.searchParams.set("sort", "date,asc");
  if (opts.city) url.searchParams.set("city", opts.city);
  if (opts.keyword) url.searchParams.set("keyword", opts.keyword);
  url.searchParams.set("countryCode", "US");

  const r = await providerFetch(url.toString());
  if (!r.ok) throw new Error(`ticketmaster ${r.status}`);
  const data = (await r.json()) as {
    _embedded?: {
      events?: Array<{
        id: string;
        name: string;
        url?: string;
        dates?: { start?: { dateTime?: string; localDate?: string } };
        _embedded?: {
          venues?: Array<{ name?: string; city?: { name?: string } }>;
        };
        images?: Array<{ url?: string }>;
        classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
      }>;
    };
  };

  return (data._embedded?.events ?? []).map((e) => {
    const venue = e._embedded?.venues?.[0];
    const start =
      e.dates?.start?.dateTime ||
      (e.dates?.start?.localDate ? `${e.dates.start.localDate}T00:00:00` : null);
    const tags = [
      e.classifications?.[0]?.segment?.name,
      e.classifications?.[0]?.genre?.name,
    ].filter(Boolean) as string[];
    return {
      id: `tm-${e.id}`,
      provider: "ticketmaster" as const,
      externalId: e.id,
      name: e.name,
      url: e.url ?? null,
      start,
      city: venue?.city?.name ?? opts.city ?? null,
      venue: venue?.name ?? null,
      imageUrl: e.images?.[0]?.url ?? null,
      tags,
    };
  });
}

export async function resolveTicketmasterUrl(raw: string): Promise<NormalizedEvent | null> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return null;
  // https://www.ticketmaster.com/event/.... or discovery id
  const idMatch =
    raw.match(/ticketmaster\.com\/event\/[^/]*-([A-Za-z0-9]+)(?:\/|$|\?)/i) ||
    raw.match(/\/discovery\/v2\/events\/([A-Za-z0-9]+)/i) ||
    raw.match(/^([A-Z0-9]{10,})$/);
  const id = idMatch?.[1];
  if (!id) return null;

  const url = new URL(`${BASE}/events/${id}.json`);
  url.searchParams.set("apikey", key);
  const r = await providerFetch(url.toString());
  if (!r.ok) return null;
  const e = (await r.json()) as {
    id: string;
    name: string;
    url?: string;
    dates?: { start?: { dateTime?: string; localDate?: string } };
    _embedded?: { venues?: Array<{ name?: string; city?: { name?: string } }> };
  };
  const venue = e._embedded?.venues?.[0];
  return {
    id: `tm-${e.id}`,
    provider: "ticketmaster",
    externalId: e.id,
    name: e.name,
    url: e.url ?? raw,
    start:
      e.dates?.start?.dateTime ||
      (e.dates?.start?.localDate ? `${e.dates.start.localDate}T00:00:00` : null),
    city: venue?.city?.name ?? null,
    venue: venue?.name ?? null,
  };
}
