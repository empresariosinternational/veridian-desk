import { NextRequest, NextResponse } from "next/server";
import { listProviderStatuses } from "@/lib/providers/registry";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

/** GET — provider readiness (no secrets leaked). */
export async function GET(req: NextRequest) {
  const limited = checkApiRateLimit(req, "resolve");
  if (limited.ok === false) return rateLimitResponse(limited.retryAfterSec);
  return NextResponse.json({ providers: listProviderStatuses() });
}
