import { arm, disarm, nodeView, presence } from "@/lib/desk/node";
import { deskPayload, NO_STORE } from "@/lib/desk/payload";
import { mutate } from "@/lib/desk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NodeEvent = "arm" | "disarm" | "presence" | "button";

/**
 * POST /api/desk/node { event: "arm" | "disarm" | "presence" | "button" }
 * - arm: consent → LISTENING (the mic still opens only while push-to-talk is held)
 * - disarm: IDLE, drops any unfiled audio
 * - presence: PIR — front-desk banner only, never starts the microphone
 * - button: the physical node's button toggles arm / disarm
 */
export async function POST(req: Request) {
  let event: NodeEvent | undefined;
  try {
    event = ((await req.json()) as { event?: NodeEvent }).event;
  } catch {
    return Response.json({ ok: false, error: "Send JSON: { event }" }, { status: 400, headers: NO_STORE });
  }
  if (!event || !["arm", "disarm", "presence", "button"].includes(event)) {
    return Response.json({ ok: false, error: "event must be arm, disarm, presence or button" }, { status: 400, headers: NO_STORE });
  }
  const now = new Date();
  const { state } = await mutate((s) => {
    if (event === "arm") arm(s, now);
    else if (event === "disarm") disarm(s, now);
    else if (event === "presence") presence(s, now);
    else if (s.node.status === "LISTENING" || s.node.status === "ARMED") disarm(s, now);
    else arm(s, now);
    return true;
  });
  const compact = new URL(req.url).searchParams.get("view") === "node";
  return Response.json(compact ? nodeView(state, now) : { ok: true, ...deskPayload(state, now) }, { headers: NO_STORE });
}
