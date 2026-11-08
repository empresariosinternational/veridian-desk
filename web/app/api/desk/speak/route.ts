import { z } from "zod";
import { deepgramKey, SPEAK_SAMPLE_RATE, SpeakFailure, spokenAudio, voiceFor } from "@/lib/desk/deepgram-voice";
import { NO_STORE } from "@/lib/desk/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(1000),
  lang: z.enum(["en", "es", "ht"]).default("en"),
}).strict();

/** Stream Aura-2 audio as it is synthesized. The key never leaves the server. */
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
  try {
    const audio = await spokenAudio(body.text, body.lang, key);
    return new Response(audio, {
      headers: {
        ...NO_STORE,
        "Content-Type": `audio/l16; rate=${SPEAK_SAMPLE_RATE}; channels=1`,
        "X-Audio-Sample-Rate": String(SPEAK_SAMPLE_RATE),
        "X-Veridian-Voice": voice.model,
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const failure = error instanceof SpeakFailure ? error : new SpeakFailure(502, "Deepgram could not speak that. The words are still on screen.");
    return Response.json({ ok: false, notice: failure.message }, { status: failure.status, headers: NO_STORE });
  }
}
