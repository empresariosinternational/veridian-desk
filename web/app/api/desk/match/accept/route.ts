import { deskPayload, NO_STORE } from "@/lib/desk/payload";
import { mutate } from "@/lib/desk/store";
import { acceptMatch } from "@/lib/desk/tools";
import type { OrgId } from "@/lib/desk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/desk/match/accept { matchId, orgId }
 * One org's consent per call. The match is accepted only when both orgs have
 * accepted. The payload is re-checked here: anything that is not
 * PUBLIC_COMMUNITY (or carries a name, counseling detail, amount or address)
 * is rejected.
 */
export async function POST(req: Request) {
  let body: { matchId?: string; orgId?: OrgId };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Send JSON: { matchId, orgId }" }, { status: 400, headers: NO_STORE });
  }
  if (!body.matchId || (body.orgId !== "tidepath" && body.orgId !== "mangrove")) {
    return Response.json({ ok: false, error: "matchId and orgId (tidepath | mangrove) are required" }, { status: 400, headers: NO_STORE });
  }
  const now = new Date();
  const { state, result } = await mutate((s) => acceptMatch(s, body.matchId!, body.orgId!, now));
  return Response.json({ ...result, ...deskPayload(state, now) }, { status: result.ok ? 200 : 422, headers: NO_STORE });
}
