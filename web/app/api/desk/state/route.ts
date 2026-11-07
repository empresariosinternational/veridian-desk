import type { NextRequest } from "next/server";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";
import { nodeView, settle } from "@/lib/desk/node";
import { deskPayload, NO_STORE } from "@/lib/desk/payload";
import { projectForFunder } from "@/lib/desk/privacy";
import { openDesk } from "@/lib/desk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respond(view: string | null, clientState: unknown) {
  const now = new Date();
  try {
    const { state } = await openDesk(clientState).mutate((s) => settle(s, now));
    if (view === "node") return Response.json(nodeView(state, now), { headers: NO_STORE });
    if (view === "funder") return Response.json(projectForFunder(state), { headers: NO_STORE });
    return Response.json(deskPayload(state, now), { headers: NO_STORE });
  } catch (e) {
    return Response.json({ error: "desk state unavailable", detail: String(e) }, { status: 500, headers: NO_STORE });
  }
}

/**
 * GET /api/desk/state             → boards, node, preferences, match proposals (staff console)
 * GET /api/desk/state?view=funder → server-side redaction: no CLINICAL text, no names, no donors
 * GET /api/desk/state?view=node   → compact status for the hardware node (status, line, color, blink)
 */
export async function GET(req: NextRequest) {
  const rl = checkApiRateLimit(req, "desk");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);
  return respond(req.nextUrl.searchParams.get("view"), undefined);
}

/** Same views for client mode (Vercel): the browser sends the state it holds as { state, view }. */
export async function POST(req: NextRequest) {
  const rl = checkApiRateLimit(req, "desk");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);
  let body: { state?: unknown; view?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is fine: the desk starts from its seed or file.
  }
  return respond(body.view ?? req.nextUrl.searchParams.get("view"), body.state);
}
