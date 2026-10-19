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

function getProvider() {
  const provider = process.env.AI_PROVIDER ?? "openrouter";
  switch (provider) {
    case "openrouter":
      return createOpenRouter({ apiKey: requireEnv("OPENROUTER_API_KEY") });
    case "google":
      return createGoogleGenerativeAI({
        apiKey: requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
      });
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
}

export const EMBEDDING_DIM = Number(process.env.AI_EMBEDDING_DIM ?? 768);

export function chatModel() {
  return getProvider().languageModel(requireEnv("AI_MODEL_CHAT"));
}

export function fastModel() {
  return getProvider().languageModel(requireEnv("AI_MODEL_FAST"));
}

export function embeddingModel() {
  return getProvider().embeddingModel(requireEnv("AI_MODEL_EMBEDDING"));
}
