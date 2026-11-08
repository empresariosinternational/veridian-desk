import { z } from "zod";
import { detectSpeaker, processUtterance } from "@/lib/desk/agent";
import { voiceFor } from "@/lib/desk/deepgram-voice";
import { aiError, assistantModel, openaiKey } from "@/lib/desk/openai";
import { planUtterance, validatePlan } from "@/lib/desk/planner";
import { failSoft, filed, working } from "@/lib/desk/node";
import { deskPayload, isProfileId, NO_STORE } from "@/lib/desk/payload";
import { mutate } from "@/lib/desk/store";
import type { AssistantPlan, HearOutcome, ProfileId } from "@/lib/desk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(600),
  profileHint: z.string().optional(),
  source: z.enum(["typed", "script", "voice"]).default("typed"),
  lang: z.enum(["en", "es", "ht"]).optional(),
  mode: z.enum(["chat", "plan", "file"]).default("file"),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(2400) }).strict()).max(12).default([]),
}).strict();

/** Browser transcript/text → optional GPT plan → validated filing tools. Audio stays in the browser. */
export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) throw new Error("invalid body");
    body = parsed.data;
  } catch {
    return Response.json({ ok: false, notice: "Send { text }, a valid mode (chat, plan, file), and up to 12 messages. Voice transcripts come from the browser; audio uploads are not accepted." }, { status: 400, headers: NO_STORE });
  }
  const hint: ProfileId | undefined = isProfileId(body.profileHint) ? body.profileHint : undefined;
  const { text, lang, source } = body;
  const voice = { via: "" };
  const soft = async (notice: string, status = 200) => {
    const { state } = await mutate((s) => {
      failSoft(s, "Try again", new Date());
      return true;
    });
    return Response.json({ ok: false, notice, voice, ...deskPayload(state, new Date()) }, { status, headers: NO_STORE });
  };

  const who = detectSpeaker(text).speaker ?? hint;
  if (!who) return soft("Pick a profile or say who is speaking first.", 400);
  const now = new Date();
  const input = { text, lang, source, profileHint: who, now };
  const gate = await mutate((s) => {
    // A browser-generated voice transcript still consumes one armed capture window.
    if (source === "voice" && s.node.status !== "LISTENING" && s.node.status !== "ARMED") return false;
    working(s, s.profiles[who].name, now);
    return true;
  });
  if (!gate.result) {
    return Response.json({ ok: false, notice: "Arm the desk first — the microphone only opens after Arm.", voice, ...deskPayload(gate.state, new Date()) }, { status: 409, headers: NO_STORE });
  }

  let plan: AssistantPlan | undefined;
  let assistantNotice: string | null = null;
  if (body.mode === "file" && !openaiKey()) {
    // Browser voice and filing are usable immediately, with no application key.
    assistantNotice = "Filed using desk rules.";
  } else {
    try {
      ({ plan } = await planUtterance(gate.state, input, body.mode, body.messages));
    } catch (error) {
      const failure = aiError(error);
      if (body.mode !== "file" || !["missing-key", "timeout", "http"].includes(failure.kind)) {
        return soft(failure.message, failure.kind === "missing-key" ? 503 : failure.kind === "timeout" ? 504 : 502);
      }
      assistantNotice = `${failure.message} Filed using desk rules.`;
    }
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

  voice.via = plan ? "OpenAI GPT" : "filed by desk rules";
  if (source !== "typed") voice.via += ` · Deepgram ${voiceFor(outcome.lang).name}`;
  const { state } = await mutate((s) => {
    const name = s.profiles[who].name;
    if (outcome.ok) filed(s, plan && !plan.actions.length ? `Replied — ${name}` : outcome.alreadyFiled ? `Already filed — ${name}` : `Filed once — ${name}`, new Date());
    else failSoft(s, "Try again", new Date());
    if (outcome.ok && outcome.cards.length && s.feed[0]) s.feed[0].via = `${source} · ${voice.via}`;
    return true;
  });

  return Response.json({
    ok: outcome.ok, outcome, transcript: text, voice,
    assistant: { status: plan ? "live" : "fallback", model: plan ? assistantModel() : null, reply: outcome.say, tasks: plan?.tasks ?? [], notice: assistantNotice },
    notice: outcome.ok ? assistantNotice : outcome.say,
    ...deskPayload(state, new Date()),
  }, { headers: NO_STORE });
}
