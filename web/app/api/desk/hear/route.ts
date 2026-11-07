import type { NextRequest } from "next/server";
import { checkApiRateLimit, rateLimitResponse } from "@/lib/api-guard";
import { detectSpeaker, processUtterance } from "@/lib/desk/agent";
import { deepgramKey, speak, transcribe, VoiceError } from "@/lib/desk/deepgram";
import { failSoft, filed, working } from "@/lib/desk/node";
import { deskPayload, isProfileId, NO_STORE } from "@/lib/desk/payload";
import { openDesk } from "@/lib/desk/store";
import type { Lang, ProfileId, Source } from "@/lib/desk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type VoiceStep = "live" | "skipped" | "missing-key" | "timeout" | "error";

type Body = {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  profileHint?: string;
  source?: Source;
  /** Client mode only: the desk state the browser holds. */
  state?: unknown;
};

const BUDGET_MS = 19_000;
// Base64 audio + state must stay under Vercel's 4.5 MB request limit (≈45 s of push-to-talk).
const MAX_AUDIO_BYTES = 2_500_000;

/**
 * POST /api/desk/hear  { text } | { audioBase64, mimeType }
 *
 * Mic or scripted line → Deepgram hears (scripted text skips transcription)
 * → desk router + tools → desk state (JSON file, or the browser's copy on
 * Vercel) → Deepgram speaks one
 * confirmation sentence. Audio is forwarded to Deepgram and dropped; only the
 * filed transcript is kept. Missing key or timeout: the desk still files by
 * its rules and says so.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const rl = checkApiRateLimit(req, "desk-hear");
  if (rl.ok === false) return rateLimitResponse(rl.retryAfterSec);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, notice: "Send JSON: { text } or { audioBase64, mimeType }." }, { status: 400, headers: NO_STORE });
  }
  const desk = openDesk(body.state);
  const hint: ProfileId | undefined = isProfileId(body.profileHint) ? body.profileHint : undefined;
  const hasKey = Boolean(deepgramKey());
  const voice: { heard: VoiceStep; spoke: VoiceStep; notice: string | null; via: string } = {
    heard: "skipped",
    spoke: "skipped",
    notice: null,
    via: "",
  };
  let text = typeof body.text === "string" ? body.text.slice(0, 600) : "";
  let lang: Lang | undefined;
  let source: Source = body.source === "typed" ? "typed" : "script";

  const soft = async (notice: string, line: string, status = 200) => {
    const { state } = await desk.mutate((s) => {
      failSoft(s, line, new Date());
      return true;
    });
    return Response.json({ ok: false, notice, voice, ...deskPayload(state, new Date()) }, { status, headers: NO_STORE });
  };

  if (!text && body.audioBase64) {
    source = "voice";
    if (!hasKey) {
      voice.heard = "missing-key";
      return soft("voice key missing — use a scripted line", "Voice key missing");
    }
    // Consent gate: audio is accepted only inside an armed capture window.
    const gate = await desk.mutate((s) => {
      if (s.node.status !== "LISTENING" && s.node.status !== "ARMED") return false;
      working(s, hint ? s.profiles[hint].name : "voice", new Date());
      return true;
    });
    if (!gate.result) {
      return Response.json(
        { ok: false, notice: "Arm the desk first — the microphone only opens after Arm.", voice, ...deskPayload(gate.state, new Date()) },
        { status: 409, headers: NO_STORE },
      );
    }
    const audio = Buffer.from(body.audioBase64, "base64");
    if (audio.length > MAX_AUDIO_BYTES) return soft("That clip is too long — keep it under 45 seconds.", "Try again", 413);
    try {
      const heard = await transcribe(audio, body.mimeType ?? "audio/webm", 12_000);
      text = heard.transcript;
      lang = heard.lang;
      voice.heard = "live";
    } catch (e) {
      const kind = e instanceof VoiceError ? e.kind : "error";
      voice.heard = kind === "timeout" ? "timeout" : "error";
      return soft(
        kind === "empty" ? "Didn't hear any speech — hold the button while you talk." : "Deepgram didn't answer — use a scripted line.",
        "Try again — didn't catch that",
      );
    }
  } else if (!text.trim()) {
    return Response.json({ ok: false, notice: "Nothing to file." }, { status: 400, headers: NO_STORE });
  } else {
    const who = detectSpeaker(text).speaker ?? hint;
    await desk.mutate((s) => {
      working(s, who ? s.profiles[who].name : "desk", new Date());
      return true;
    });
  }

  // File it. Tools are plain functions over the JSON store.
  let outcome;
  try {
    ({ result: outcome } = await desk.mutate((s) => processUtterance(s, { text, lang, source, profileHint: hint, now: new Date() })));
  } catch (e) {
    return soft(`The desk could not file that (${String(e).slice(0, 80)}).`, "Try again");
  }

  // Speak one short confirmation.
  let speech: { audioBase64: string; mimeType: string } | null = null;
  if (outcome.ok && outcome.spoken) {
    if (!hasKey) {
      voice.spoke = "missing-key";
      voice.notice = "voice key missing — scripted line used";
    } else {
      const remaining = BUDGET_MS - (Date.now() - started);
      if (remaining > 1_500) {
        try {
          speech = await speak(outcome.spoken, outcome.lang, Math.min(6_000, remaining - 500));
          voice.spoke = "live";
        } catch (e) {
          voice.spoke = e instanceof VoiceError && e.kind === "timeout" ? "timeout" : "error";
        }
      } else {
        voice.spoke = "timeout";
      }
    }
  }
  voice.via = voice.heard === "live" || voice.spoke === "live" ? "Deepgram voice" : "filed by desk rules — voice skipped";

  const { state } = await desk.mutate((s) => {
    const who = outcome.speaker !== "unknown" ? s.profiles[outcome.speaker]?.name ?? "desk" : "desk";
    if (outcome.ok) filed(s, outcome.alreadyFiled ? `Already filed — ${who}` : `Filed once — ${who}`, new Date());
    else failSoft(s, "Try again", new Date());
    if (outcome.ok && s.feed[0]) s.feed[0].via = `${source} · ${voice.via}`;
    return true;
  });

  return Response.json(
    { ok: outcome.ok, outcome, transcript: text, speech, voice, notice: outcome.ok ? voice.notice : outcome.say, ...deskPayload(state, new Date()) },
    { headers: NO_STORE },
  );
}
