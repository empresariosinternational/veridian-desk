import { z } from "zod";
import { detectSpeaker, processUtterance } from "@/lib/desk/agent";
import { aiError, assistantModel, openaiKey, speak, supportedAudio, transcribe } from "@/lib/desk/openai";
import { planUtterance, validatePlan } from "@/lib/desk/planner";
import { failSoft, filed, working } from "@/lib/desk/node";
import { deskPayload, isProfileId, NO_STORE } from "@/lib/desk/payload";
import { mutate } from "@/lib/desk/store";
import type { AssistantPlan, HearOutcome, Lang, ProfileId, Source } from "@/lib/desk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type VoiceStep = "live" | "skipped" | "missing-key" | "timeout" | "error";
const bodySchema = z.object({
  text: z.string().max(600).optional(),
  audioBase64: z.string().max(4_000_000).optional(),
  mimeType: z.string().max(100).default("audio/webm"),
  profileHint: z.string().optional(),
  source: z.enum(["typed", "script"]).default("typed"),
  mode: z.enum(["chat", "plan", "file"]).default("file"),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(2400) }).strict()).max(12).default([]),
});

const BUDGET_MS = 55_000;
const MAX_AUDIO_BYTES = 3_000_000;

/** Text or armed push-to-talk → GPT chat/plan → validated filing tools → optional voice. */
export async function POST(req: Request) {
  const started = Date.now();
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("invalid body");
    body = parsed.data;
  } catch {
    return Response.json({ ok: false, notice: "Send { text } or { audioBase64, mimeType }, a valid mode (chat, plan, file), and up to 12 messages." }, { status: 400, headers: NO_STORE });
  }
  const hint: ProfileId | undefined = isProfileId(body.profileHint) ? body.profileHint : undefined;
  const hasKey = Boolean(openaiKey());
  const voice: { heard: VoiceStep; spoke: VoiceStep; notice: string | null; via: string } = { heard: "skipped", spoke: "skipped", notice: null, via: "" };
  let text = body.text?.trim() ?? "";
  let lang: Lang | undefined;
  let source: Source = body.source;

  const soft = async (notice: string, status = 200) => {
    const { state } = await mutate((s) => {
      failSoft(s, "Try again", new Date());
      return true;
    });
    return Response.json({ ok: false, notice, voice, ...deskPayload(state, new Date()) }, { status, headers: NO_STORE });
  };

  if (!text && body.audioBase64) {
    source = "voice";
    if (!hasKey) {
      voice.heard = "missing-key";
      return soft("OPENAI_API_KEY is missing on the server — type a note or use a demo line.", 503);
    }
    if (!supportedAudio(body.mimeType)) return soft("Use a WebM, MP4, MP3, M4A, or WAV recording.", 400);
    const audio = Buffer.from(body.audioBase64, "base64");
    if (!audio.length) return soft("That audio clip is empty.", 400);
    if (audio.length > MAX_AUDIO_BYTES) return soft("That clip is too long — keep it under a minute.", 413);
    // The existing consent gate applies before any audio is forwarded.
    const gate = await mutate((s) => {
      if (s.node.status !== "LISTENING" && s.node.status !== "ARMED") return false;
      working(s, hint ? s.profiles[hint].name : "voice", new Date());
      return true;
    });
    if (!gate.result) {
      return Response.json({ ok: false, notice: "Arm the desk first — the microphone only opens after Arm.", voice, ...deskPayload(gate.state, new Date()) }, { status: 409, headers: NO_STORE });
    }
    try {
      const heard = await transcribe(audio, body.mimeType);
      text = heard.transcript.slice(0, 600);
      lang = heard.lang;
      voice.heard = "live";
    } catch (error) {
      const failure = aiError(error);
      voice.heard = failure.kind === "timeout" ? "timeout" : "error";
      return soft(failure.kind === "empty" ? "Didn't hear any speech — hold the button while you talk." : failure.message, 502);
    }
  } else if (!text) {
    return Response.json({ ok: false, notice: "Enter a message first." }, { status: 400, headers: NO_STORE });
  }

  const who = detectSpeaker(text).speaker ?? hint;
  if (!who) return soft("Pick a profile or say who is speaking first.", 400);
  const now = new Date();
  const input = { text, lang, source, profileHint: who, now };
  const { state: snapshot } = await mutate((s) => {
    working(s, s.profiles[who].name, now);
    return true;
  });

  let plan: AssistantPlan | undefined;
  let assistantNotice: string | null = null;
  try {
    ({ plan } = await planUtterance(snapshot, input, body.mode, body.messages, Math.min(20_000, BUDGET_MS - (Date.now() - started) - 1000)));
  } catch (error) {
    const failure = aiError(error);
    // Offline filing preserves the demo. Chat/plan errors never become filed notes.
    if (body.mode !== "file" || !["missing-key", "timeout", "http"].includes(failure.kind)) {
      return soft(failure.message, failure.kind === "missing-key" ? 503 : failure.kind === "timeout" ? 504 : 502);
    }
    assistantNotice = `${failure.message} Filed using desk rules.`;
  }

  let outcome: HearOutcome;
  try {
    ({ result: outcome } = await mutate((s) => {
      if (plan) validatePlan(plan, s, who, body.mode);
      return processUtterance(s, input, plan);
    }));
  } catch {
    return soft("The desk could not file that. Nothing was confirmed; try again.", 500);
  }

  let speech: { audioBase64: string; mimeType: string } | null = null;
  if (outcome.ok && outcome.spoken && source !== "typed") {
    if (!hasKey) {
      voice.spoke = "missing-key";
    } else {
      const remaining = BUDGET_MS - (Date.now() - started);
      if (remaining > 1500) {
        try {
          speech = await speak(outcome.spoken, outcome.lang, Math.min(8_000, remaining - 500));
          voice.spoke = "live";
        } catch (error) {
          voice.spoke = aiError(error).kind === "timeout" ? "timeout" : "error";
          voice.notice = "Spoken confirmation is unavailable. The response is shown below.";
        }
      } else {
        voice.spoke = "timeout";
        voice.notice = "Spoken confirmation timed out. The response is shown below.";
      }
    }
  }
  voice.via = plan ? "OpenAI GPT" : "filed by desk rules";
  if (voice.heard === "live" || voice.spoke === "live") voice.via += " · OpenAI voice";
  else if (source !== "typed") voice.via += " — voice skipped";

  const { state } = await mutate((s) => {
    const name = s.profiles[who].name;
    if (outcome.ok) filed(s, plan && !plan.actions.length ? `Replied — ${name}` : outcome.alreadyFiled ? `Already filed — ${name}` : `Filed once — ${name}`, new Date());
    else failSoft(s, "Try again", new Date());
    if (outcome.ok && outcome.cards.length && s.feed[0]) s.feed[0].via = `${source} · ${voice.via}`;
    return true;
  });

  return Response.json({
    ok: outcome.ok, outcome, transcript: text, speech, voice,
    assistant: { status: plan ? "live" : "fallback", model: plan ? assistantModel() : null, reply: outcome.say, tasks: plan?.tasks ?? [], notice: assistantNotice },
    notice: outcome.ok ? assistantNotice ?? voice.notice : outcome.say,
    ...deskPayload(state, new Date()),
  }, { headers: NO_STORE });
}
