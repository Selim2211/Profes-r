import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Single entry point for all model access. No other file imports a provider package.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getProvider() {
  const provider = process.env.AI_PROVIDER ?? "google";
  if (provider !== "google") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
  return createGoogleGenerativeAI({
    apiKey: requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  });
}

export const EMBEDDING_DIM = Number(process.env.AI_EMBEDDING_DIM ?? 768);

export function chatModel() {
  return getProvider()(requireEnv("AI_MODEL_CHAT"));
}

export function fastModel() {
  return getProvider()(requireEnv("AI_MODEL_FAST"));
}

export function embeddingModel() {
  return getProvider().embedding(requireEnv("AI_MODEL_EMBEDDING"));
}
