import { nodeView, settle } from "@/lib/desk/node";
import { deskPayload, NO_STORE } from "@/lib/desk/payload";
import { projectForFunder } from "@/lib/desk/privacy";
import { openDesk } from "@/lib/desk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(state: Parameters<typeof deskPayload>[0], view: string | null, now: Date) {
  if (view === "node") return Response.json(nodeView(state, now), { headers: NO_STORE });
  if (view === "funder") return Response.json(projectForFunder(state), { headers: NO_STORE });
  return Response.json(deskPayload(state, now), { headers: NO_STORE });
}

/**
 * GET /api/desk/state            → boards, node, preferences, match proposals (staff console)
 * GET /api/desk/state?view=funder → server-side redaction: no CLINICAL text, no names, no donors
 * GET /api/desk/state?view=node   → compact status for the hardware node (status, line, color, blink)
 *
 * In client mode (Vercel) GET returns the seed; the browser then keeps its own copy and
 * POSTs it here: { state, view? } → the same views, settled for the current time.
 */
export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get("view");
  const now = new Date();
  try {
    const { state } = await openDesk().mutate((s) => settle(s, now));
    return respond(state, view, now);
  } catch (e) {
    return Response.json({ error: "desk state unavailable", detail: String(e) }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  let body: { state?: unknown; view?: string };
  try {
    body = (await req.json()) as { state?: unknown; view?: string };
  } catch {
    return Response.json({ error: "Send JSON: { state, view? }" }, { status: 400, headers: NO_STORE });
  }
  const now = new Date();
  try {
    const { state } = await openDesk(body?.state).mutate((s) => settle(s, now));
    return respond(state, typeof body?.view === "string" ? body.view : null, now);
  } catch (e) {
    return Response.json({ error: "desk state unavailable", detail: String(e) }, { status: 500, headers: NO_STORE });
  }
}
