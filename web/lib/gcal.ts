/** Google Calendar — client-side OAuth via GIS. Token never leaves the browser. */

export type CalEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string | null;
  allDay: boolean;
  htmlLink?: string | null;
  location?: string | null;
};

const TOKEN_KEY = "agentscene.gcal.token";
const CLIENT_ID = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "" : "";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function hasGoogleClientId(): boolean {
  return Boolean(CLIENT_ID && CLIENT_ID.length > 10);
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { access_token, expires_at } = JSON.parse(raw) as {
      access_token: string;
      expires_at: number;
    };
    if (!access_token || Date.now() > expires_at - 60_000) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return access_token;
  } catch {
    return null;
  }
}

function storeToken(access_token: string, expires_in: number) {
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      access_token,
      expires_at: Date.now() + expires_in * 1000,
    }),
  );
}

export function clearToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
}

type GisTokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
};

type GisNamespace = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
      }) => GisTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GisNamespace;
  }
}

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisScriptPromise) return gisScriptPromise;
  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load failed"));
    document.head.appendChild(s);
  });
  return gisScriptPromise;
}

/** Open Google OAuth consent; resolves with access token. */
export async function connectGoogleCalendar(): Promise<string> {
  if (!hasGoogleClientId()) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set");
  }
  await loadGisScript();
  const google = window.google;
  if (!google?.accounts?.oauth2) throw new Error("Google Identity Services unavailable");

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "auth cancelled"));
          return;
        }
        storeToken(resp.access_token, resp.expires_in ?? 3600);
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export async function fetchUpcomingEvents(token: string, max = 8): Promise<CalEvent[]> {
  const timeMin = new Date().toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("maxResults", String(max));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    if (r.status === 401) clearToken();
    throw new Error(`calendar ${r.status}`);
  }
  const data = (await r.json()) as {
    items?: {
      id?: string;
      summary?: string;
      htmlLink?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  };

  return (data.items ?? []).map((it, i) => {
    const allDay = Boolean(it.start?.date && !it.start?.dateTime);
    const start = it.start?.dateTime ?? (it.start?.date ? `${it.start.date}T00:00:00` : new Date().toISOString());
    const end = it.end?.dateTime ?? (it.end?.date ? `${it.end.date}T00:00:00` : null);
    return {
      id: it.id ?? `ev-${i}`,
      title: it.summary ?? "(no title)",
      start,
      end,
      allDay,
      htmlLink: it.htmlLink ?? null,
      location: it.location ?? null,
    };
  });
}

/** Demo agenda so the hackathon flow never breaks without a client ID. */
export function demoAgenda(): CalEvent[] {
  const now = new Date();
  const day = (offset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  return [
    {
      id: "demo-1",
      title: "Coffee with Mysha · Maman",
      start: day(0, 9, 30),
      end: day(0, 10, 30),
      allDay: false,
      location: "Coral Gables",
    },
    {
      id: "demo-2",
      title: "Founders dinner — Brickell",
      start: day(1, 19, 0),
      end: day(1, 21, 0),
      allDay: false,
      location: "Miami",
    },
    {
      id: "demo-3",
      title: "Follow-up: Josh / Canopy afterparty",
      start: day(2, 11, 0),
      end: day(2, 11, 30),
      allDay: false,
    },
    {
      id: "demo-4",
      title: "Scene walkthrough · Veridian debrief",
      start: day(3, 15, 0),
      end: day(3, 16, 0),
      allDay: false,
    },
  ];
}

/** No-auth Google Calendar template URL — works without sign-in. */
export function googleCalendarTemplateUrl(opts: {
  title: string;
  start: string | null;
  end?: string | null;
  details?: string;
  location?: string;
}): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: opts.title });
  if (opts.start) {
    const start = new Date(opts.start);
    const end = opts.end ? new Date(opts.end) : new Date(start.getTime() + 90 * 60 * 1000);
    const fmt = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    params.set("dates", `${fmt(start)}/${fmt(end)}`);
  }
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function fmtCalWhen(iso: string, allDay?: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
