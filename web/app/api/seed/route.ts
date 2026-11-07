import { NextRequest } from "next/server";
import { expandSeed } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { checkApiRateLimit, clampInt, rateLimitResponse } from "@/lib/api-guard";

export const revalidate = 1800;

export async function GET(req: NextRequest) {
  const rl = checkApiRateLimit(req, "seed");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);

  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  const limit = clampInt(req.nextUrl.searchParams.get("limit"), 1, 15, 10);
  const sessionKey = await getServerSessionKey();
  const auth = sessionKey ? { sessionKey } : undefined;
  try {
    const result = await expandSeed(url, limit, auth);
    if (!result.seed_id) return Response.json({ error: "could not resolve" }, { status: 404 });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
