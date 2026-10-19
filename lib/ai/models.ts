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

export const EMBEDDING_DIM = Number(process.env.AI_EMBEDDING_DIM ?? 768);

// Every model handed out below is wrapped so its token usage lands in usage_logs (see usage.ts).
function languageModel(envName: string) {
  const id = requireEnv(envName);
  const model = providerName() === "openrouter" ? openrouter().languageModel(id) : google().languageModel(id);
  return wrapLanguageModel({ model, middleware: languageUsageMiddleware });
}

export function chatModel() {
  return languageModel("AI_MODEL_CHAT");
}

export function fastModel() {
  return languageModel("AI_MODEL_FAST");
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
