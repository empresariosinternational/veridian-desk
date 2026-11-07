import { nodeView, settle } from "@/lib/desk/node";
import { deskPayload, NO_STORE } from "@/lib/desk/payload";
import { projectForFunder } from "@/lib/desk/privacy";
import { mutate } from "@/lib/desk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/desk/state            → boards, node, preferences, match proposals (staff console)
 * GET /api/desk/state?view=funder → server-side redaction: no CLINICAL text, no names, no donors
 * GET /api/desk/state?view=node   → compact status for the hardware node (status, line, color, blink)
 */
export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get("view");
  const now = new Date();
  try {
    const { state } = await mutate((s) => settle(s, now));
    if (view === "node") return Response.json(nodeView(state, now), { headers: NO_STORE });
    if (view === "funder") return Response.json(projectForFunder(state), { headers: NO_STORE });
    return Response.json(deskPayload(state, now), { headers: NO_STORE });
  } catch (e) {
    return Response.json({ error: "desk state unavailable", detail: String(e) }, { status: 500, headers: NO_STORE });
  }
}
