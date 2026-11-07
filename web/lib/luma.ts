// TS port of luma_scene.py — runs the same digest on demand from any (cities, follows).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lumaCookieHeader } from "@/lib/luma-session";
import { lumaFetch, runPool } from "@/lib/luma-rate-limit";
import { unstable_cache } from "next/cache";

/**
 * Dev flag: when `LUMA_SAMPLE_DATA=1`, home-feed reads come from
 * shared/sample-data.json instead of hitting the Luma API. Lets `/past`
 * render without a live session.
 */
export function useSampleData(): boolean {
  return process.env.LUMA_SAMPLE_DATA === "1";
}

const SAMPLE_DATA_PATHS = [
  join(process.cwd(), "..", "shared", "sample-data.json"),
  join(process.cwd(), "shared", "sample-data.json"),
];

let sampleEntriesCache: any[] | null = null;

/** Load the raw home-feed entries from the bundled sample data fixture. */
function loadSampleEntries(): any[] {
  if (sampleEntriesCache) return sampleEntriesCache;
  for (const p of SAMPLE_DATA_PATHS) {
    try {
      const data = JSON.parse(readFileSync(p, "utf8"));
      sampleEntriesCache = Array.isArray(data) ? data : (data?.entries ?? data?.events ?? []);
      return sampleEntriesCache;
    } catch {
      /* try next candidate path */
    }
  }
  throw new Error(
    `LUMA_SAMPLE_DATA=1 but could not read sample data from: ${SAMPLE_DATA_PATHS.join(", ")}`,
  );
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 luma-scene/0.3";
const REV_API = { revalidate: 1800 };       // 30m on api calls
const REV_PROFILE = { revalidate: 21600 };  // 6h on profile HTML
const LUMA_API = "https://api.luma.com";

/** Hard caps to avoid hammering Luma when follows/events lists grow. */
export const MAX_FOLLOWS_PER_DIGEST = 25;
export const MAX_EVENT_DETAIL_FETCHES = 24;
export const MAX_SEED_EVENT_DETAILS = 10;
export const POOL_CONCURRENCY = 2;

export type LumaAuth = { sessionKey?: string | null };
export type HomeEventPeriod = "past" | "upcoming" | "future";

export type HomeEvent = {
  id: string;
  name: string;
  slug: string | null;
  url: string | null;
  start: string | null;
  end: string | null;
  tz: string | null;
  city: string;
  coverUrl: string | null;
  /** Human-readable guest/host role label for the calendar entry */
  role: string | null;
  approvalStatus: string | null;
};

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    return s || null;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** Some Luma fields are localized objects; prefer English then first string value. */
function pickText(v: unknown): string | null {
  const direct = asString(v);
  if (direct) return direct;
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return asString(o.en) ?? asString(o.default) ?? Object.values(o).map(asString).find(Boolean) ?? null;
}

function normalizeEventSlug(urlOrSlug: string | null): string | null {
  if (!urlOrSlug) return null;
  const s = urlOrSlug.trim();
  if (!s) return null;
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const path = new URL(s).pathname.replace(/^\/+/, "");
      return path.split("/")[0] || null;
    }
  } catch {
    /* bare slug */
  }
  return s.replace(/^\/+/, "").split("?")[0] || null;
}

/** Calendar entry role / RSVP blob from home/get-events entries */
function parseCalendarRole(entry: Record<string, unknown>): { role: string | null; approvalStatus: string | null } {
  const raw =
    entry.role ??
    entry.guest_role ??
    entry.rsvp ??
    entry.user_event_role ??
    entry.calendar_role;

  if (!raw) {
    const type = asString(entry.type);
    return { role: type, approvalStatus: null };
  }

  if (typeof raw === "string") {
    return { role: raw, approvalStatus: null };
  }

  if (typeof raw !== "object") {
    return { role: null, approvalStatus: null };
  }

  const o = raw as Record<string, unknown>;
  const type = asString(o.type);
  const approval =
    asString(o.approval_status) ??
    asString(entry.approval_status) ??
    asString(entry.guest_approval_status);
  const parts = [type, approval].filter(Boolean);
  return {
    role: parts.length ? parts.join(" · ") : null,
    approvalStatus: approval,
  };
}

/** True when Luma marks the user's RSVP as attending (not pending/declined). */
export function isGoingApproval(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "approved";
}

export function filterGoingEvents(events: HomeEvent[]): HomeEvent[] {
  return events.filter((e) => isGoingApproval(e.approvalStatus));
}

function parseHomeEventEntry(entry: unknown): HomeEvent | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  const ev = (row.event ?? row) as Record<string, unknown>;
  if (!ev || typeof ev !== "object") return null;

  const slug = normalizeEventSlug(
    pickText(ev.url) ?? pickText(ev.slug) ?? pickText(ev.event_url),
  );
  const id = pickText(ev.api_id) ?? slug ?? pickText(ev.id);
  if (!id) return null;

  const geo =
    ev.geo_address_info && typeof ev.geo_address_info === "object"
      ? (ev.geo_address_info as Record<string, unknown>)
      : {};
  const { role, approvalStatus } = parseCalendarRole(row);

  const city =
    pickText(geo.city_state) ??
    pickText(geo.city) ??
    pickText(geo.short_address) ??
    pickText(geo.full_address) ??
    pickText(ev.location) ??
    "";

  return {
    id,
    name: pickText(ev.name) ?? pickText(ev.title) ?? "(untitled)",
    slug,
    url: slug ? `https://luma.com/${slug}` : pickText(ev.url) ? pickText(ev.url)! : null,
    start: pickText(ev.start_at) ?? pickText(ev.start),
    end: pickText(ev.end_at) ?? pickText(ev.end),
    tz: pickText(ev.timezone) ?? pickText(ev.tz),
    city,
    coverUrl: pickText(ev.cover_url) ?? pickText(ev.social_image_url) ?? pickText(ev.image_url),
    role,
    approvalStatus,
  };
}

function apiHeaders(auth?: LumaAuth): HeadersInit {
  const h: Record<string, string> = {
    accept: "application/json",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": UA,
    referer: "https://luma.com/",
  };
  if (auth?.sessionKey) h.cookie = lumaCookieHeader(auth.sessionKey);
  return h;
}

function htmlHeaders(auth?: LumaAuth): HeadersInit {
  const h: Record<string, string> = {
    accept: "text/html,application/xhtml+xml",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": UA,
    referer: "https://luma.com/",
  };
  if (auth?.sessionKey) h.cookie = lumaCookieHeader(auth.sessionKey);
  return h;
}

async function jget(url: string, revalidate = REV_API.revalidate, auth?: LumaAuth): Promise<any> {
  const r = await lumaFetch(url, {
    kind: "api",
    headers: apiHeaders(auth),
    revalidate,
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function jgetAuthed(url: string, auth: LumaAuth): Promise<any> {
  if (!auth.sessionKey) throw new Error("session required");
  const r = await lumaFetch(url, {
    kind: "authed",
    headers: apiHeaders(auth),
    cache: "no-store",
  });
  if (!r.ok) {
    const snippet = await r.text().catch(() => "");
    throw new Error(`${r.status} ${url}${snippet ? `: ${snippet.slice(0, 160)}` : ""}`);
  }
  return r.json();
}

async function htext(url: string, revalidate = REV_PROFILE.revalidate, auth?: LumaAuth): Promise<string> {
  const r = await lumaFetch(url, {
    kind: "html",
    headers: htmlHeaders(auth),
    revalidate,
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

/** Check that a pasted session works against Luma's authed user endpoint. */
export async function verifyLumaSession(sessionKey: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const auth = { sessionKey };
  const urls = [`${LUMA_API}/user`, "https://api.lu.ma/user"];
  let lastErr = "could not verify with luma";
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 700));
    try {
      const d = url.startsWith(LUMA_API)
        ? await jgetAuthed(url, auth)
        : await jget(url, 0, auth);
      const user = d?.user ?? d;
      const name = user?.name ?? user?.username ?? user?.email ?? null;
      if (!name && !user?.api_id) {
        lastErr = "unexpected response from luma";
        continue;
      }
      return { ok: true, name: name ?? undefined };
    } catch (e) {
      lastErr = String(e);
    }
  }
  return { ok: false, error: lastErr };
}

/** Authenticated home feed — e.g. `period=past` from api.luma.com/home/get-events. */
export async function fetchHomeEvents(
  period: HomeEventPeriod,
  auth: LumaAuth,
  limit = 25,
  opts?: { onlyGoing?: boolean },
): Promise<HomeEvent[]> {
  let entries: any[];
  if (useSampleData()) {
    entries = loadSampleEntries().slice(0, limit);
  } else {
    const url = `${LUMA_API}/home/get-events?pagination_limit=${limit}&period=${encodeURIComponent(period)}`;
    const data = await jgetAuthed(url, auth);
    entries = (data?.entries ?? data?.events ?? []) as any[];
  }
  const parsed = entries.map(parseHomeEventEntry).filter((e): e is HomeEvent => e !== null);
  if (opts?.onlyGoing) return filterGoingEvents(parsed);
  return parsed;
}

export async function resolveFollow(entry: string, auth?: LumaAuth): Promise<{ id: string | null; name: string | null; avatar: string | null }> {
  const e = entry.trim();
  if (!e) return { id: null, name: null, avatar: null };
  let knownId: string | null = null;
  let url: string;
  if (e.startsWith("usr-")) {
    // raw usr-id: fetch the canonical profile page so we can still get a display name
    knownId = e;
    url = `https://luma.com/user/${e}`;
  } else if (e.startsWith("http://") || e.startsWith("https://")) {
    url = e;
  } else if (/^(www\.)?luma\.com\//.test(e) || /^(www\.)?lu\.ma\//.test(e)) {
    url = `https://${e.replace(/^www\./, "")}`;
  } else {
    // bare handle — canonical profile path is /user/<handle>
    url = `https://luma.com/user/${e.replace(/^@/, "")}`;
  }

  const html = await htext(url, REV_PROFILE.revalidate, auth);
  const idMatch = html.match(/"api_id":"(usr-[A-Za-z0-9]+)"/);
  const id = knownId ?? idMatch?.[1] ?? null;

  let name: string | null = null;
  if (idMatch && id) {
    const pos = idMatch.index ?? 0;
    // Profile pages: name appears BEFORE api_id; event-host blobs: name appears AFTER.
    // Scan both directions.
    const back = html.slice(Math.max(0, pos - 600), pos);
    const backSegs = back.split('"name":"');
    if (backSegs.length > 1) {
      const last = backSegs[backSegs.length - 1];
      const m = last.match(/^([^"]+)"/);
      if (m) name = m[1];
    }
    if (!name) {
      const fwd = html.slice(pos, pos + 600);
      const m = fwd.match(/"name":"([^"]+)"/);
      if (m) name = m[1];
    }
  }
  if (!name && id) {
    const m = html.match(/"name":"([^"]+)"/);
    if (m) name = m[1];
  }
  // pull the avatar from the JSON blob nearest the api_id (the profile owner / host)
  let avatar: string | null = null;
  if (idMatch) {
    const pos = idMatch.index ?? 0;
    const win = html.slice(Math.max(0, pos - 800), pos + 800);
    const am = win.match(/"avatar_url":"([^"]+)"/);
    if (am) avatar = am[1];
  }
  return { id, name, avatar };
}

export async function fetchHosted(usrId: string, auth?: LumaAuth): Promise<any[]> {
  const d = await jget(`https://api.lu.ma/user/profile/events-hosting?user_api_id=${usrId}`, REV_API.revalidate, auth);
  return (d?.entries ?? []) as any[];
}

export async function fetchEventDetail(slug: string, auth?: LumaAuth): Promise<any | null> {
  try {
    return await jget(`https://api.lu.ma/event/get?event_api_id=${encodeURIComponent(slug)}`, REV_API.revalidate, auth);
  } catch {
    return null;
  }
}

export async function fetchFeaturedGuestIds(slug: string, auth?: LumaAuth): Promise<Set<string>> {
  const d = await fetchEventDetail(slug, auth);
  if (!d) return new Set();
  const guests = d.featured_guests ?? d.guests ?? [];
  return new Set(guests.map((g: any) => g?.api_id).filter(Boolean));
}

export type EventRow = {
  id: string;
  name: string;
  slug: string | null;
  url: string | null;
  start: string | null;
  tz: string | null;
  city: string;
  address: string | null;
  match_city: string | null;
  host_ids: string[];
  attendee_ids: string[];
  overlap: number;
};

export type Digest = {
  generated_at: string;
  cities: string[];
  people: Record<string, { name: string; avatar?: string | null }>;
  following: { id: string; name: string; events: number; avatar?: string | null }[];
  groups: Record<string, EventRow[]>;
  elsewhere: EventRow[];
  skipped: { who: string; why: string }[];
  totals: { events: number; featured: number };
};

function normCity(s: string) {
  return (s ?? "").trim().toLowerCase();
}

export function matchCity(eventCity: string, cities: string[], aliases: Record<string, string[]> = {}): string | null {
  const ec = normCity(eventCity);
  if (!ec) return null;
  for (const c of cities) {
    const candidates = [c, ...(aliases[c] ?? [])];
    for (const cand of candidates) {
      const nc = normCity(cand);
      if (!nc) continue;
      if (nc === ec || ec.includes(nc)) return c;
    }
  }
  return null;
}

export type BuildOpts = {
  cities: string[];
  follows: string[]; // entries: usr-X, profile URL, or handle
  cityAliases?: Record<string, string[]>;
  withAttendees?: boolean;
  sessionKey?: string | null;
};

export async function buildDigest(opts: BuildOpts): Promise<Digest> {
  const { cities, cityAliases = {}, withAttendees = true, sessionKey } = opts;
  const follows = opts.follows.slice(0, MAX_FOLLOWS_PER_DIGEST);
  const auth: LumaAuth | undefined = sessionKey ? { sessionKey } : undefined;
  const people: Record<string, { name: string; avatar?: string | null }> = {};
  const skipped: { who: string; why: string }[] = [];

  if (opts.follows.length > MAX_FOLLOWS_PER_DIGEST) {
    skipped.push({
      who: `${opts.follows.length - MAX_FOLLOWS_PER_DIGEST} follows`,
      why: `capped at ${MAX_FOLLOWS_PER_DIGEST} per refresh to limit API load`,
    });
  }

  const resolved = await runPool(
    follows,
    (f) =>
      resolveFollow(f, auth).catch((e) => ({
        id: null as string | null,
        name: null as string | null,
        err: String(e),
      })),
    POOL_CONCURRENCY,
  );
  resolved.forEach((r, i) => {
    if (!r.id) { skipped.push({ who: follows[i], why: (r as any).err ?? "resolve failed" }); return; }
    people[r.id] = { name: r.name ?? r.id, avatar: (r as any).avatar ?? null };
  });

  const ids = Object.keys(people);
  const hostedResults = await runPool(
    ids,
    async (id) => {
      try {
        return { id, entries: await fetchHosted(id, auth) };
      } catch (e) {
        skipped.push({ who: people[id]?.name ?? id, why: `hosted fetch: ${String(e)}` });
        return { id, entries: [] as any[] };
      }
    },
    POOL_CONCURRENCY,
  );

  // aggregate events
  type Rec = {
    id: string; name: string; slug: string | null; start_at: string | null;
    tz: string | null; city: string; address: string | null;
    host_ids: Set<string>; attendee_ids: Set<string>;
  };
  const events = new Map<string, Rec>();
  const now = Date.now();
  for (const { id, entries } of hostedResults) {
    for (const e of entries) {
      const ev = e?.event ?? {};
      const eid = ev.api_id as string | undefined;
      if (!eid) continue;
      const startMs = ev.start_at ? Date.parse(ev.start_at) : NaN;
      if (!Number.isNaN(startMs) && startMs < now) continue;
      let rec = events.get(eid);
      if (!rec) {
        const geo = ev.geo_address_info ?? {};
        rec = {
          id: eid,
          name: ev.name ?? "(untitled)",
          slug: ev.url ?? null,
          start_at: ev.start_at ?? null,
          tz: ev.timezone ?? null,
          city: geo.city_state ?? geo.city ?? "",
          address: geo.full_address ?? geo.address ?? null,
          host_ids: new Set(),
          attendee_ids: new Set(),
        };
        events.set(eid, rec);
      }
      rec.host_ids.add(id);

      // capture co-host names opportunistically from hosting payload (sometimes present)
      const cohosts = ev.hosts ?? [];
      for (const h of cohosts) {
        if (h?.api_id) {
          const cur = people[h.api_id];
          if (!cur) people[h.api_id] = { name: h.name ?? h.api_id };
          else if (h.name && cur.name === h.api_id) cur.name = h.name; // upgrade usr-id placeholder
        }
      }
    }
  }

  if (withAttendees) {
    const followed = new Set(Object.keys(people));
    const slugs = [...events.values()]
      .filter((rec) => rec.slug)
      .slice(0, MAX_EVENT_DETAIL_FETCHES);
    if (events.size > MAX_EVENT_DETAIL_FETCHES) {
      skipped.push({
        who: "attendee overlap",
        why: `only checked ${MAX_EVENT_DETAIL_FETCHES} events (cap)`,
      });
    }
    await runPool(
      slugs,
      async (rec) => {
        const guests = await fetchFeaturedGuestIds(rec.slug!, auth);
        for (const g of guests) if (followed.has(g) && !rec.host_ids.has(g)) rec.attendee_ids.add(g);
      },
      POOL_CONCURRENCY,
    );
  }

  // serialize + sort + group
  const farFuture = "9999";
  const rows: EventRow[] = [...events.values()]
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      url: r.slug ? `https://luma.com/${r.slug}` : null,
      start: r.start_at,
      tz: r.tz,
      city: r.city,
      address: r.address,
      match_city: matchCity(r.city, cities, cityAliases),
      host_ids: [...r.host_ids].sort(),
      attendee_ids: [...r.attendee_ids].sort(),
      overlap: r.host_ids.size + r.attendee_ids.size,
    }))
    .sort((a, b) => (b.overlap - a.overlap) || ((a.start ?? farFuture).localeCompare(b.start ?? farFuture)));

  const groups: Record<string, EventRow[]> = Object.fromEntries(cities.map((c) => [c, [] as EventRow[]]));
  const elsewhere: EventRow[] = [];
  for (const r of rows) {
    if (r.match_city && groups[r.match_city]) groups[r.match_city].push(r);
    else elsewhere.push(r);
  }

  // explicit follows (not opportunistic co-hosts), with per-host upcoming-event counts
  const eventCount: Record<string, number> = {};
  for (const r of rows) for (const h of r.host_ids) eventCount[h] = (eventCount[h] ?? 0) + 1;
  const seenFollow = new Set<string>();
  const following = resolved
    .filter((r): r is { id: string; name: string | null; avatar: string | null } => !!r.id)
    .filter((r) => (seenFollow.has(r.id) ? false : (seenFollow.add(r.id), true)))
    .map((r) => ({ id: r.id, name: people[r.id]?.name ?? r.name ?? r.id, events: eventCount[r.id] ?? 0, avatar: people[r.id]?.avatar ?? (r as any).avatar ?? null }))
    .sort((a, b) => (b.events - a.events) || a.name.localeCompare(b.name));

  const featured = rows.filter((r) => r.overlap > 1).length;
  return {
    generated_at: new Date().toISOString(),
    cities,
    people,
    following,
    groups,
    elsewhere,
    skipped,
    totals: { events: rows.length, featured },
  };
}

/**
 * Cached digest builder. Refreshing the same scene is an instant cache hit (no Luma
 * calls, so the outbound rate limiter never engages); a cold build runs at most once
 * per `revalidate` window per unique (cities, follows, session) combination.
 */
export async function buildDigestCached(opts: BuildOpts): Promise<Digest> {
  const keyParts = [
    "digest-v1",
    opts.cities.join("|"),
    [...opts.follows].sort().join(","),
    opts.sessionKey ?? "anon", // anon scenes share a cache entry; authed are keyed per session
  ];
  const run = unstable_cache(async () => buildDigest(opts), keyParts, { revalidate: 1800 });
  return run();
}

// Given a seed host, expand to seed + up to N most-frequent co-hosts.
export async function expandSeed(
  seedInput: string,
  limit = 10,
  auth?: LumaAuth,
): Promise<{ seed_id: string | null; follows: string[]; people: Record<string, { name: string }> }> {
  const seed = await resolveFollow(seedInput, auth);
  if (!seed.id) return { seed_id: null, follows: [], people: {} };
  const people: Record<string, { name: string }> = { [seed.id]: { name: seed.name ?? seed.id } };
  const counts = new Map<string, number>();

  const entries = await fetchHosted(seed.id, auth);
  const toScan = entries.slice(0, MAX_SEED_EVENT_DETAILS);
  await runPool(
    toScan,
    async (e: any) => {
      const slug = e?.event?.url;
      if (!slug) return;
      const d = await fetchEventDetail(slug, auth);
      for (const h of d?.hosts ?? []) {
        const id = h?.api_id;
        if (!id || id === seed.id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (!people[id]) people[id] = { name: h.name ?? id };
      }
    },
    POOL_CONCURRENCY,
  );

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit - 1).map(([id]) => id);
  return { seed_id: seed.id, follows: [seed.id, ...top], people };
}
