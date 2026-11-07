/** Server-only OpenAI configuration, shared by chat, planning, and voice. */
import OpenAI, { APIConnectionTimeoutError, APIUserAbortError, toFile } from "openai";
import WebSocket from "ws";
import type { Lang } from "./types";

export const CREOLE_LIVE = false;

export function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY?.trim() || null;
}

export function assistantModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
}

export class DeskAIError extends Error {
  constructor(message: string, public readonly kind: "missing-key" | "timeout" | "http" | "empty" | "invalid" | "refused") {
    super(message);
  }
}

export function aiError(error: unknown): DeskAIError {
  if (error instanceof DeskAIError) return error;
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return new DeskAIError("OpenAI returned an invalid plan. Nothing was filed.", "invalid");
  }
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) {
    return new DeskAIError("OpenAI timed out. Try again.", "timeout");
  }
  return new DeskAIError("OpenAI could not complete this request. Try again.", "http");
}

export function openaiClient(timeoutMs = 20_000): OpenAI {
  const key = openaiKey();
  if (!key) throw new DeskAIError("OPENAI_API_KEY is missing on the server.", "missing-key");
  return new OpenAI({ apiKey: key, timeout: timeoutMs, maxRetries: 0 });
}

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/mp4": "mp4", "audio/m4a": "m4a", "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};

export function supportedAudio(mimeType: string): boolean {
  return Boolean(AUDIO_EXT[mimeType.split(";")[0].trim().toLowerCase()]);
}

export async function transcribe(audio: Buffer, mimeType: string, timeoutMs = 12_000): Promise<{ transcript: string; lang?: Lang }> {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (!supportedAudio(type)) throw new DeskAIError("Use a WebM, MP4, MP3, M4A, or WAV recording.", "invalid");
  try {
    const data = await openaiClient(timeoutMs).audio.transcriptions.create({
      model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-transcribe",
      file: await toFile(audio, `desk-clip.${AUDIO_EXT[type]}`, { type }),
      prompt: "A nonprofit desk note. Names: Tidepath, Mangrove Mews, Marisol, Denise, Yesenia, Reginald, Owen, Claudette, Beatriz, Ana, Luis, Edison Elementary, West Little River.",
    });
    const transcript = data.text?.trim();
    if (!transcript) throw new DeskAIError("No speech heard.", "empty");
    const detected = (data as unknown as { languages?: { code: string }[] }).languages?.[0]?.code;
    return { transcript, lang: detected === "es" || detected === "en" ? detected : undefined };
  } catch (error) {
    throw aiError(error);
  }
}

/** Wrap mono 24 kHz PCM from Realtime in a WAV the browser can play. */
function wav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Realtime replaces the retiring /audio/speech models. No browser credentials. */
export async function speak(text: string, lang: Lang, timeoutMs = 8_000): Promise<{ audioBase64: string; mimeType: string }> {
  const client = openaiClient(timeoutMs);
  return new Promise((resolve, reject) => {
    const url = new URL(`${client.baseURL.replace(/\/$/, "")}/realtime`);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set("model", process.env.OPENAI_VOICE_MODEL?.trim() || "gpt-realtime-2.1-mini");
    const rt = new WebSocket(url, {
      headers: { Authorization: `Bearer ${openaiKey()}` },
      maxPayload: 2_000_000, handshakeTimeout: timeoutMs, perMessageDeflate: false,
    });
    const send = (event: object) => rt.send(JSON.stringify(event));
    const chunks: Buffer[] = [];
    let finished = false;
    let bytes = 0;
    const finish = (error?: DeskAIError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      rt.terminate();
      if (error) reject(error);
      else if (!bytes) reject(new DeskAIError("OpenAI returned no speech.", "empty"));
      else resolve({ audioBase64: wav(Buffer.concat(chunks)).toString("base64"), mimeType: "audio/wav" });
    };
    const timer = setTimeout(() => finish(new DeskAIError("OpenAI voice timed out.", "timeout")), timeoutMs);
    rt.on("error", () => finish(new DeskAIError("OpenAI voice is unavailable.", "http")));
    rt.on("close", () => finish(new DeskAIError("OpenAI voice connection closed.", "http")));
    rt.on("message", (raw) => {
      if (finished) return;
      let event;
      try { event = JSON.parse(raw.toString()); }
      catch { return finish(new DeskAIError("OpenAI voice returned an invalid event.", "invalid")); }
      if (event.type === "error") return finish(new DeskAIError("OpenAI voice is unavailable.", "http"));
      if (event.type === "session.created") send({
        type: "session.update",
        session: {
          type: "realtime", output_modalities: ["audio"],
          audio: { input: { turn_detection: null }, output: { format: { type: "audio/pcm", rate: 24_000 }, voice: process.env.OPENAI_VOICE?.trim() || "marin" } },
          instructions: `Read the user's confirmation verbatim in ${lang === "es" ? "Spanish" : "English"}. Do not answer it or add any words.`,
        },
      });
      if (event.type === "session.updated") {
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: text.slice(0, 400) }] } });
        send({ type: "response.create", response: { output_modalities: ["audio"], max_output_tokens: 500 } });
      }
      if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
        const chunk = Buffer.from(event.delta, "base64");
        bytes += chunk.length;
        if (bytes > 2_000_000) return finish(new DeskAIError("OpenAI voice response was too long.", "invalid"));
        chunks.push(chunk);
      }
      if (event.type === "response.done") finish(event.response?.status === "completed" ? undefined : new DeskAIError("OpenAI voice did not finish.", "http"));
    });
  });
}
