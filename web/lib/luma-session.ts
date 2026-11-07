import { cookies } from "next/headers";

/** Luma browser session cookie name (DevTools → Application → Cookies). */
export const LUMA_AUTH_COOKIE_NAME = "luma.auth-session-key";

/** First-party cookie we set after the user pastes their Luma session. */
export const SCENE_SESSION_COOKIE = "luma_scene_session";

const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

/** Normalize pasted text: raw value, `key=value`, or a full Cookie header (e.g. from cURL). */
export function parseSessionInput(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  // cURL / DevTools: `--header 'cookie: ...'` or `Cookie: ...`
  const headerLine = s.match(/(?:^|\n)\s*(?:--header\s+)?['"]?cookie['"]?\s*:\s*(.+?)(?:['"]\s*)?$/im);
  if (headerLine) s = headerLine[1].trim().replace(/^['"]|['"]$/g, "");

  s = s.replace(/^cookie:\s*/i, "").trim();
  if (!s) return null;

  // Full browser cookie string (multiple cookies) — keep as-is for authed API calls
  if (s.includes(";")) return s.replace(/\s+/g, " ").trim();

  const named = s.match(/luma\.auth-session-key\s*=\s*([^;\s]+)/i);
  if (named) return named[1];

  if (s.startsWith("usr-")) return s;

  if (/^[^=]+=.+$/.test(s)) {
    const eq = s.indexOf("=");
    const key = s.slice(0, eq).trim().toLowerCase();
    if (key.includes("luma") || key.includes("session") || key.includes("auth")) {
      return s.slice(eq + 1).trim();
    }
    return s;
  }

  return s;
}

/** Build the `Cookie` request header from stored session (key only or full header). */
export function lumaCookieHeader(session: string): string {
  const s = session.trim();
  if (!s) return "";
  if (s.includes(";") || /luma\.[a-z.-]+\s*=/i.test(s)) return s;
  if (s.startsWith("usr-")) return `${LUMA_AUTH_COOKIE_NAME}=${s}`;
  return s;
}

export async function getServerSessionKey(): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(SCENE_SESSION_COOKIE)?.value;
  return v?.trim() || null;
}

export function sessionCookieOptions(sessionKey: string) {
  return {
    name: SCENE_SESSION_COOKIE,
    value: sessionKey,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: SCENE_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
