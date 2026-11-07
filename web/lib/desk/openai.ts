/** Server-only OpenAI configuration for GPT chat and planning. Voice lives in the browser. */
import OpenAI, { APIConnectionTimeoutError, APIUserAbortError } from "openai";

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
