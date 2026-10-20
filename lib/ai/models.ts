import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapEmbeddingModel, wrapLanguageModel } from "ai";
import { embeddingUsageMiddleware, languageUsageMiddleware } from "./usage";

// Single entry point for all model access. No other file imports a provider package.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function providerName(): "openrouter" | "google" {
  const provider = process.env.AI_PROVIDER ?? "openrouter";
  if (provider !== "openrouter" && provider !== "google") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
  return provider;
}

function openrouter() {
  return createOpenRouter({
    apiKey: requireEnv("OPENROUTER_API_KEY"),
    // Optional: route through a proxy when openrouter.ai is unreachable from the network.
    baseURL: process.env.OPENROUTER_BASE_URL || undefined,
  });
}

function google() {
  return createGoogleGenerativeAI({
    apiKey: requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  });
}

// A value like "768 # comment" or an empty variable must not turn into NaN (it would be sent as null).
export function parseEmbeddingDim(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 768;
}

export const EMBEDDING_DIM = parseEmbeddingDim(process.env.AI_EMBEDDING_DIM);

// Every model handed out below is wrapped so its token usage lands in usage_logs (see usage.ts).
function languageModel(...envNames: string[]) {
  // The first variable that is set wins (e.g. AI_MODEL_JUDGE, falling back to AI_MODEL_CHAT).
  const name = envNames.find((n) => process.env[n]) ?? envNames[envNames.length - 1];
  const id = requireEnv(name);
  const model = providerName() === "openrouter" ? openrouter().languageModel(id) : google().languageModel(id);
  return wrapLanguageModel({ model, middleware: languageUsageMiddleware });
}

export function chatModel() {
  return languageModel("AI_MODEL_CHAT");
}

export function fastModel() {
  return languageModel("AI_MODEL_FAST");
}

// Checks every claim of a summary against the notes: by far the biggest token consumer of a summary run,
// so it has its own setting. Unset, it uses the chat model.
export function judgeModel() {
  return languageModel("AI_MODEL_JUDGE", "AI_MODEL_CHAT");
}

// AI_EMBEDDINGS=off runs the app without vectors: nothing is embedded and notes are found with full-text
// search only (summaries do not need embeddings at all). Any other value keeps embeddings on.
export function embeddingsEnabled(): boolean {
  return (process.env.AI_EMBEDDINGS ?? "").trim().toLowerCase() !== "off";
}

// Embeddings are always requested at EMBEDDING_DIM (pgvector columns are vector(768)).
export function embeddingModel() {
  const id = requireEnv("AI_MODEL_EMBEDDING");
  const model =
    providerName() === "openrouter"
      ? openrouter().textEmbeddingModel(id, { extraBody: { dimensions: EMBEDDING_DIM } })
      : google().embedding(id);
  return wrapEmbeddingModel({ model, middleware: embeddingUsageMiddleware });
}

// Extra per-call options needed to get EMBEDDING_DIM vectors from the active provider.
export function embeddingProviderOptions() {
  return providerName() === "google"
    ? { google: { outputDimensionality: EMBEDDING_DIM } }
    : undefined;
}
