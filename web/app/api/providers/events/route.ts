import { NextRequest, NextResponse } from "next/server";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";
import {
  resolveProviderUrl,
  searchAllConfigured,
  searchProvider,
} from "@/lib/providers/registry";
import type { EventProviderId } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/providers/events?provider=ticketmaster&city=Miami&keyword=
 * GET /api/providers/events?url=https://...
 * GET /api/providers/events?provider=all&city=Miami
 */
export async function GET(req: NextRequest) {
  const limited = checkApiRateLimit(req, "resolve");
  if (limited.ok === false) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url")?.trim();
  const provider = (searchParams.get("provider") || "all") as EventProviderId | "all";
  const city = searchParams.get("city")?.trim() || undefined;
  const keyword = searchParams.get("keyword")?.trim() || undefined;
  const limit = Math.min(Number(searchParams.get("limit") || 12), 25);

  try {
    if (url) {
      const event = await resolveProviderUrl(url);
      if (!event) {
        return NextResponse.json({ error: "could not resolve url" }, { status: 404 });
      }
      return NextResponse.json({ events: [event] });
    }

    const opts = { city, keyword, limit };
    const events =
      provider === "all"
        ? await searchAllConfigured(opts)
        : await searchProvider(provider, opts);

    return NextResponse.json({ events, provider });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "provider error", events: [] },
      { status: 502 },
    );
  }
}
