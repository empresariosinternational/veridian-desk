/**
 * Spoken replies use Deepgram Aura-2, not the browser speech synthesizer.
 * The model is chosen for a human personality. Aura-1 and local browser voices
 * stay out of this path because they read as flat and robotic.
 *
 * English: Vesta — Natural, Expressive, Patient, Empathetic.
 * Spanish: Selena — Latin American, Approachable, Friendly, Calm, Positive,
 * and able to move between Spanish and English without a second voice.
 * Aura has no Haitian Creole voice, so Creole confirmations use Vesta.
 */
import type { Lang } from "./types";

const HUMAN_TRAITS = new Set([
  "natural",
  "warm",
  "caring",
  "empathetic",
  "friendly",
  "expressive",
  "calm",
  "approachable",
  "comfortable",
  "positive",
  "patient",
]);

export type SpokenVoice = {
  provider: "deepgram";
  model: string;
  name: string;
  lang: "en" | "es";
  accent: string;
  personality: readonly string[];
  why: string;
};

const ENGLISH: SpokenVoice = {
  provider: "deepgram",
  model: "aura-2-vesta-en",
  name: "Vesta",
  lang: "en",
  accent: "American",
  personality: ["Natural", "Expressive", "Patient", "Empathetic"],
  why: "A patient, expressive person at the desk, not an announcer.",
};

const SPANISH: SpokenVoice = {
  provider: "deepgram",
  model: "aura-2-selena-es",
  name: "Selena",
  lang: "es",
  accent: "Latin American",
  personality: ["Approachable", "Casual", "Friendly", "Calm", "Positive"],
  why: "A calm Miami voice that can cross between Spanish and English.",
};

export function deepgramKey(): string | null {
  return process.env.DEEPGRAM_API_KEY?.trim() || null;
}

/** Reject a voice that would sound like a generic synthesizer. */
export function assertHumanVoice(voice: SpokenVoice): void {
  if (!/^aura-2-[a-z0-9-]+-(en|es)$/.test(voice.model)) {
    throw new Error(`${voice.model} is not an Aura-2 voice.`);
  }
  const hits = voice.personality.filter((trait) => HUMAN_TRAITS.has(trait.toLowerCase()));
  if (hits.length < 2) {
    throw new Error(`${voice.name} needs a human personality. Traits were: ${voice.personality.join(", ")}.`);
  }
}

export function voiceFor(lang: Lang): SpokenVoice {
  const voice = lang === "es" ? SPANISH : ENGLISH;
  assertHumanVoice(voice);
  return voice;
}

/** 24 kHz linear16 streams as it is synthesized. Playback starts on the first chunk. */
export const SPEAK_SAMPLE_RATE = 24_000;

/**
 * Aura's default pace draws vowels out. 1.15 is one step quicker and keeps
 * the voice's contour. Deepgram only accepts steps of 0.05.
 */
export const SPEAK_SPEED = 1.15;

export class SpeakFailure extends Error {
  constructor(readonly status: 502 | 504, message: string) {
    super(message);
  }
}

export function speakStreamUrl(lang: Lang): string {
  const voice = voiceFor(lang);
  const url = new URL("wss://api.deepgram.com/v1/speak");
  url.searchParams.set("model", voice.model);
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", String(SPEAK_SAMPLE_RATE));
  url.searchParams.set("speed", String(SPEAK_SPEED));
  return url.toString();
}

/** One Speak and one Flush. Splitting the line makes Aura lengthen each ending. */
export function speakMessages(text: string): string[] {
  return [
    JSON.stringify({ type: "Speak", text: text.trim() }),
    JSON.stringify({ type: "Flush" }),
  ];
}

type SocketInit = { headers: Record<string, string> };

function createSpeakSocket(url: string, key: string): WebSocket {
  const Socket = WebSocket as unknown as new (address: string, init?: SocketInit) => WebSocket;
  const socket = new Socket(url, { headers: { Authorization: `Token ${key}` } });
  socket.binaryType = "arraybuffer";
  return socket;
}

function pcmBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

type PcmQueue = { next(timeoutMs: number): Promise<Uint8Array | null> };

function queuePcm(socket: WebSocket, flushes: number): PcmQueue {
  const queue: Uint8Array[] = [];
  let closed = false;
  let notify: (() => void) | null = null;
  let seenFlushes = 0;
  const wake = () => {
    const ready = notify;
    notify = null;
    ready?.();
  };
  const accept = (data: unknown) => {
    const bytes = pcmBytes(data);
    if (bytes?.byteLength) {
      queue.push(bytes);
      wake();
      return;
    }
    if (typeof data !== "string") return;
    try {
      const message = JSON.parse(data) as { type?: string };
      if (message.type !== "Flushed") return;
      seenFlushes += 1;
      if (seenFlushes >= flushes && socket.readyState === 1) socket.send(JSON.stringify({ type: "Close" }));
    } catch {
      // Control text is never forwarded. It can echo request details.
    }
  };
  let incoming = Promise.resolve();
  socket.addEventListener("message", (event: MessageEvent) => {
    if (typeof Blob !== "undefined" && event.data instanceof Blob) {
      const blob = event.data;
      incoming = incoming.then(async () => accept(await blob.arrayBuffer())).catch(() => undefined);
      return;
    }
    accept(event.data);
  });
  socket.addEventListener("close", () => {
    closed = true;
    wake();
  });
  socket.addEventListener("error", () => {
    closed = true;
    wake();
  });
  return {
    async next(timeoutMs: number) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const chunk = queue.shift();
        if (chunk) return chunk;
        if (closed) return null;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new SpeakFailure(504, "Deepgram took too long. The words are still on screen.");
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remaining);
          notify = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    },
  };
}

async function waitUntilOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === 1) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SpeakFailure(504, "Deepgram took too long. The words are still on screen.")), 5_000);
    const finish = (error?: SpeakFailure) => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onOpen = () => finish();
    const onError = () => finish(new SpeakFailure(502, "Deepgram could not speak that. The words are still on screen."));
    socket.addEventListener("open", onOpen);
    socket.addEventListener("error", onError);
  });
}

/** Stream Aura-2 audio. The first chunk is available before the rest of the line is synthesized. */
export async function spokenAudio(text: string, lang: Lang, key: string): Promise<ReadableStream<Uint8Array>> {
  const messages = speakMessages(text);
  const socket = createSpeakSocket(speakStreamUrl(lang), key);
  try {
    await waitUntilOpen(socket);
  } catch (error) {
    try { socket.close(); } catch { /* Already closed. */ }
    throw error;
  }
  const flushes = messages.filter((message) => (JSON.parse(message) as { type?: string }).type === "Flush").length;
  const queue = queuePcm(socket, flushes);
  for (const message of messages) socket.send(message);

  async function* chunks(): AsyncGenerator<Uint8Array> {
    let started = false;
    try {
      for (;;) {
        const chunk = await queue.next(started ? 12_000 : 8_000);
        if (!chunk) {
          if (!started) throw new SpeakFailure(502, "Deepgram returned silence. The words are still on screen.");
          return;
        }
        started = true;
        yield chunk;
      }
    } finally {
      try { socket.close(); } catch { /* Already closed. */ }
    }
  }

  const upcoming = chunks();
  const first = await upcoming.next();
  if (first.done) throw new SpeakFailure(502, "Deepgram returned silence. The words are still on screen.");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(first.value);
    },
    async pull(controller) {
      const next = await upcoming.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      void upcoming.return(undefined);
    },
  });
}
