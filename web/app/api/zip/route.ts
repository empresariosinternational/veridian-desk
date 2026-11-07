import { NextRequest } from "next/server";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";

export const revalidate = 2592000; // 30d

export async function GET(req: NextRequest) {
  const rl = checkApiRateLimit(req, "zip");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);

  const zip = req.nextUrl.searchParams.get("zip")?.trim();
  if (!zip) return Response.json({ error: "zip required" }, { status: 400 });
  const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {
    next: { revalidate: 2592000 },
  });
  if (!r.ok) return Response.json({ error: "invalid zip" }, { status: 404 });
  const d = await r.json();
  const place = d?.places?.[0];
  if (!place) return Response.json({ error: "no city for zip" }, { status: 404 });
  return Response.json({
    city: place["place name"],
    state: place["state abbreviation"],
    state_full: place["state"],
  });
}
