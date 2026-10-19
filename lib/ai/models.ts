import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

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

export function chatModel() {
  const id = requireEnv("AI_MODEL_CHAT");
  return providerName() === "openrouter"
    ? openrouter().languageModel(id)
    : google().languageModel(id);
}

export function fastModel() {
  const id = requireEnv("AI_MODEL_FAST");
  return providerName() === "openrouter"
    ? openrouter().languageModel(id)
    : google().languageModel(id);
}

// Embeddings are always requested at EMBEDDING_DIM (pgvector columns are vector(768)).
export function embeddingModel() {
  const id = requireEnv("AI_MODEL_EMBEDDING");
  if (providerName() === "openrouter") {
    return openrouter().textEmbeddingModel(id, {
      extraBody: { dimensions: EMBEDDING_DIM },
    });
  }
  return google().embedding(id);
}

// Extra per-call options needed to get EMBEDDING_DIM vectors from the active provider.
export function embeddingProviderOptions() {
  return providerName() === "google"
    ? { google: { outputDimensionality: EMBEDDING_DIM } }
    : undefined;
}
