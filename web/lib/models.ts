/**
 * Provider-neutral model registry powering /benchmarks.
 *
 * NOTE: scores/pricing below are an illustrative demo dataset (config-driven,
 * not hardcoded into UI). Swap in live benchmark sources before treating any
 * number as authoritative.
 */

export type ModelRegistryEntry = {
  provider: string;
  modelId: string;
  displayName: string;
  capabilities: Array<"reasoning" | "coding" | "agentic" | "multimodal" | "embeddings">;
  contextWindow: number;
  openWeight: boolean;
  localDeployable: boolean;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  /** Composite agentic-coding score, 0–100 (demo dataset). */
  agenticScore: number;
  dataPolicy: "local" | "zero_retention" | "retained" | "unknown";
  verifiedAt: string;
};

export const REGISTRY_AS_OF = "2026-07-19";

export const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    provider: "Anthropic",
    modelId: "claude-fable-5",
    displayName: "Claude Fable 5",
    capabilities: ["reasoning", "coding", "agentic", "multimodal"],
    contextWindow: 1_000_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 5,
    outputPerMillion: 25,
    agenticScore: 94,
    dataPolicy: "zero_retention",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "OpenAI",
    modelId: "gpt-5.6-codex",
    displayName: "GPT-5.6 Codex",
    capabilities: ["reasoning", "coding", "agentic"],
    contextWindow: 400_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 4,
    outputPerMillion: 20,
    agenticScore: 92,
    dataPolicy: "zero_retention",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Google",
    modelId: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    capabilities: ["reasoning", "coding", "multimodal"],
    contextWindow: 2_000_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 3.5,
    outputPerMillion: 18,
    agenticScore: 90,
    dataPolicy: "retained",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "xAI",
    modelId: "grok-4.5",
    displayName: "Grok 4.5",
    capabilities: ["reasoning", "coding", "agentic"],
    contextWindow: 512_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 3,
    outputPerMillion: 15,
    agenticScore: 88,
    dataPolicy: "retained",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Moonshot",
    modelId: "kimi-k3",
    displayName: "Kimi K3",
    capabilities: ["reasoning", "coding", "agentic"],
    contextWindow: 512_000,
    openWeight: true,
    localDeployable: true,
    inputPerMillion: 0.8,
    outputPerMillion: 3.2,
    agenticScore: 89,
    dataPolicy: "unknown",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Alibaba",
    modelId: "qwen-3.5-coder",
    displayName: "Qwen 3.5 Coder",
    capabilities: ["coding", "agentic"],
    contextWindow: 256_000,
    openWeight: true,
    localDeployable: true,
    inputPerMillion: 0.5,
    outputPerMillion: 2,
    agenticScore: 86,
    dataPolicy: "unknown",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Z.ai",
    modelId: "glm-5.2",
    displayName: "GLM-5.2",
    capabilities: ["reasoning", "agentic"],
    contextWindow: 256_000,
    openWeight: true,
    localDeployable: true,
    inputPerMillion: 0.6,
    outputPerMillion: 2.4,
    agenticScore: 87,
    dataPolicy: "unknown",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "DeepSeek",
    modelId: "deepseek-v4",
    displayName: "DeepSeek V4",
    capabilities: ["reasoning", "coding"],
    contextWindow: 256_000,
    openWeight: true,
    localDeployable: true,
    inputPerMillion: 0.4,
    outputPerMillion: 1.6,
    agenticScore: 85,
    dataPolicy: "unknown",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Nous Research",
    modelId: "hermes-4",
    displayName: "Hermes 4",
    capabilities: ["reasoning", "agentic"],
    contextWindow: 128_000,
    openWeight: true,
    localDeployable: true,
    inputPerMillion: null,
    outputPerMillion: null,
    agenticScore: 80,
    dataPolicy: "local",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Microsoft",
    modelId: "muse-spark",
    displayName: "Muse Spark",
    capabilities: ["multimodal", "agentic"],
    contextWindow: 200_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 2.5,
    outputPerMillion: 10,
    agenticScore: 82,
    dataPolicy: "retained",
    verifiedAt: REGISTRY_AS_OF,
  },
  {
    provider: "Cursor",
    modelId: "composer-2.5",
    displayName: "Composer 2.5",
    capabilities: ["coding", "agentic"],
    contextWindow: 256_000,
    openWeight: false,
    localDeployable: false,
    inputPerMillion: 2,
    outputPerMillion: 8,
    agenticScore: 88,
    dataPolicy: "zero_retention",
    verifiedAt: REGISTRY_AS_OF,
  },
];

export function fmtContext(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}K`;
}

export function fmtPrice(v: number | null): string {
  return v == null ? "—" : `$${v}`;
}
