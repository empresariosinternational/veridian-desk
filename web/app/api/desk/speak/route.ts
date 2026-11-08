import { z } from "zod";
import { deepgramKey, speakRequest, voiceFor } from "@/lib/desk/deepgram-voice";
import { NO_STORE } from "@/lib/desk/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  lang: z.enum(["en", "es", "ht"]).default("en"),
}).strict();

/** Text in, Deepgram Aura-2 audio out. The key never leaves the server. */
export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("invalid body");
    body = parsed.data;
  } catch {
    return Response.json({ ok: false, notice: "Send { text, lang }." }, { status: 400, headers: NO_STORE });
  }

  const key = deepgramKey();
  if (!key) {
    return Response.json({ ok: false, notice: "DEEPGRAM_API_KEY is missing on the server." }, { status: 503, headers: NO_STORE });
  }

  const voice = voiceFor(body.lang);
  const request = speakRequest(body.text, body.lang, key);
  let upstream: Response;
  try {
    upstream = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(20_000) });
  } catch {
    return Response.json({ ok: false, notice: "Deepgram took too long. The words are still on screen." }, { status: 504, headers: NO_STORE });
  }
  if (!upstream.ok) {
    return Response.json({ ok: false, notice: "Deepgram could not speak that. The words are still on screen." }, { status: 502, headers: NO_STORE });
  }
  const audio = await upstream.arrayBuffer();
  if (!audio.byteLength) {
    return Response.json({ ok: false, notice: "Deepgram returned silence. The words are still on screen." }, { status: 502, headers: NO_STORE });
  }
  return new Response(audio, {
    headers: {
      ...NO_STORE,
      "Content-Type": "audio/mpeg",
      "X-Veridian-Voice": voice.model,
    },
  });
}
