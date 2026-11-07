/** Cross-platform event fabric — Luma, Ticketmaster, Eventbrite, Partiful. */

export type EventProviderId = "luma" | "ticketmaster" | "eventbrite" | "partiful";

export type NormalizedEvent = {
  id: string;
  provider: EventProviderId;
  /** Provider-native id */
  externalId: string;
  name: string;
  url: string | null;
  start: string | null;
  end?: string | null;
  city: string | null;
  venue?: string | null;
  imageUrl?: string | null;
  /** Free-form tags / classifications */
  tags?: string[];
};

export type ProviderStatus = {
  id: EventProviderId;
  label: string;
  configured: boolean;
  mode: "live" | "url_only" | "org_scoped" | "digest";
  blurb: string;
  envHint?: string;
};

export type SearchOpts = {
  city?: string;
  keyword?: string;
  limit?: number;
};

export type ResolveResult =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; error: string };
