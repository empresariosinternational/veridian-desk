import { deskPayload, isProfileId, NO_STORE } from "@/lib/desk/payload";
import { mutate, readState, resetState } from "@/lib/desk/store";
import { checkSentence, rememberPreference, respondToShift } from "@/lib/desk/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action =
  | { type: "shift.respond"; recruitId: string; decision: "accept" | "decline" }
  | { type: "preference.set"; profileId: string; key: string; value: unknown }
  | { type: "grant.check"; text: string }
  | { type: "reset" };

/**
 * POST /api/desk/action
 * - shift.respond   B2C accept / decline of a recruit offer (decline never penalizes)
 * - preference.set  rememberPreference — the only learning in the demo
 * - grant.check     run a sentence through the truth-ledger guard (no write)
 * - reset           back to the committed seed, for rehearsals
 */
export async function POST(req: Request) {
  let a: Action;
  try {
    a = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Send JSON with a type." }, { status: 400, headers: NO_STORE });
  }
  const now = new Date();

  if (a.type === "grant.check") {
    const state = await readState();
    return Response.json({ ok: true, check: checkSentence(state, String(a.text ?? "")) }, { headers: NO_STORE });
  }
  if (a.type === "reset") {
    const state = await resetState();
    return Response.json({ ok: true, say: "Desk reset to the seed.", ...deskPayload(state, now) }, { headers: NO_STORE });
  }
  if (a.type === "shift.respond") {
    if (a.decision !== "accept" && a.decision !== "decline") {
      return Response.json({ ok: false, error: "decision must be accept or decline" }, { status: 400, headers: NO_STORE });
    }
    const { state, result } = await mutate((s) => respondToShift(s, String(a.recruitId), a.decision, now));
    return Response.json({ ...result, ...deskPayload(state, now) }, { status: result.ok ? 200 : 409, headers: NO_STORE });
  }
  if (a.type === "preference.set") {
    if (!isProfileId(a.profileId)) return Response.json({ ok: false, error: "unknown profile" }, { status: 400, headers: NO_STORE });
    const profileId = a.profileId;
    const { state, result } = await mutate((s) => rememberPreference(s, profileId, String(a.key), a.value, now));
    return Response.json({ ...result, ...deskPayload(state, now) }, { status: result.ok ? 200 : 400, headers: NO_STORE });
  }
  return Response.json({ ok: false, error: "unknown action" }, { status: 400, headers: NO_STORE });
}
