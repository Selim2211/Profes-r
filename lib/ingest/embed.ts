import { embedMany } from "ai";
import { EMBEDDING_DIM, embeddingModel, embeddingProviderOptions } from "@/lib/ai/models";

const BATCH_SIZE = 16;
const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function embedBatch(values: string[]): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: embeddingModel(),
        values,
        providerOptions: embeddingProviderOptions(),
        maxRetries: 0,
      });
      return embeddings;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS - 1) throw error;
      await sleep(1000 * 2 ** attempt); // exponential backoff on rate limits / transient errors
    }
  }
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const embeddings = await embedBatch(values.slice(i, i + BATCH_SIZE));
    for (const embedding of embeddings) {
      if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `Embedding boyutu ${embedding.length}, beklenen ${EMBEDDING_DIM}. AI_MODEL_EMBEDDING ayarını kontrol et.`,
        );
      }
      all.push(embedding);
    }
  }
  return all;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
