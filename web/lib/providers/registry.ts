import type { EventProviderId, NormalizedEvent, ProviderStatus, SearchOpts } from "./types";
import { eventbriteStatus, listEventbriteOrgEvents, resolveEventbriteUrl } from "./eventbrite";
import { partifulStatus, listPartifulRsvps, resolvePartifulUrl } from "./partiful";
import { ticketmasterStatus, searchTicketmaster, resolveTicketmasterUrl } from "./ticketmaster";
import type { EventRow } from "@/lib/luma";

export function listProviderStatuses(): ProviderStatus[] {
  return [
    {
      id: "luma",
      label: "Luma",
      configured: true,
      mode: "digest",
      blurb: "Primary scene digest — follows + cities in your URL",
    },
    ticketmasterStatus(),
    eventbriteStatus(),
    partifulStatus(),
  ];
}

export function lumaRowsToNormalized(rows: EventRow[]): NormalizedEvent[] {
  return rows.map((e) => ({
    id: `luma-${e.id}`,
    provider: "luma" as const,
    externalId: e.id,
    name: e.name,
    url: e.url,
    start: e.start,
    city: e.match_city ?? e.city,
    venue: e.address,
    tags: e.overlap > 1 ? [`overlap:${e.overlap}`] : [],
  }));
}

export async function searchProvider(
  provider: EventProviderId,
  opts: SearchOpts,
): Promise<NormalizedEvent[]> {
  switch (provider) {
    case "ticketmaster":
      return searchTicketmaster(opts);
    case "eventbrite":
      return listEventbriteOrgEvents(opts);
    case "partiful":
      return listPartifulRsvps(opts);
    case "luma":
      return [];
    default:
      return [];
  }
}

export async function resolveProviderUrl(raw: string): Promise<NormalizedEvent | null> {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("ticketmaster") || lower.includes("livenation")) {
    return resolveTicketmasterUrl(s);
  }
  if (lower.includes("eventbrite")) {
    return resolveEventbriteUrl(s);
  }
  if (lower.includes("partiful")) {
    return resolvePartifulUrl(s);
  }
  // Try each resolver for bare ids
  return (
    (await resolvePartifulUrl(s)) ||
    (await resolveEventbriteUrl(s)) ||
    (await resolveTicketmasterUrl(s))
  );
}

export async function searchAllConfigured(opts: SearchOpts): Promise<NormalizedEvent[]> {
  const statuses = listProviderStatuses().filter((p) => p.id !== "luma" && p.configured);
  const results = await Promise.all(
    statuses.map(async (p) => {
      try {
        return await searchProvider(p.id, opts);
      } catch {
        return [] as NormalizedEvent[];
      }
    }),
  );
  return results.flat();
}
