import { NextRequest } from "next/server";
import { resolveFollow } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";

export const revalidate = 86400;

export async function GET(req: NextRequest) {
  const rl = checkApiRateLimit(req, "resolve");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);

  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  const sessionKey = await getServerSessionKey();
  try {
    const { id, name } = await resolveFollow(url, sessionKey ? { sessionKey } : undefined);
    if (!id) return Response.json({ error: "could not resolve to usr-id" }, { status: 404 });
    return Response.json({ id, name });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
