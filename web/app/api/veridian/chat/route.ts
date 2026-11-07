import { answer, requestSchema } from "@/lib/veridian/assistant";
import { aiError } from "@/lib/desk/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let input;
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new Error("invalid request");
    input = parsed.data;
  } catch {
    return Response.json({ ok: false, notice: "Please send a message and a valid task list." }, { status: 400, headers });
  }
  try { return Response.json({ ok: true, ...await answer(input) }, { headers }); }
  catch (error) { return Response.json({ ok: false, notice: aiError(error).message }, { status: 502, headers }); }
}
