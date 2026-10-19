import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

export type UsagePurpose = "chat" | "embed" | "ocr" | "summarize" | "quiz" | "memory" | "plan";

type UsageContext = { supabase: SupabaseClient; userId: string; purpose: UsagePurpose };

// Whoever starts a piece of work (an API route) says whose it is; every model call made inside it,
// however deep, is then logged for that user without the call sites knowing about logging.
const storage = new AsyncLocalStorage<UsageContext>();

export function withUsage<T>(
  owner: { supabase: SupabaseClient; userId: string },
  purpose: UsagePurpose,
  run: () => T,
): T {
  return storage.run({ ...owner, purpose }, run);
}

// Changes only the purpose for a stretch of work (e.g. image transcription inside a summary job).
export function withPurpose<T>(purpose: UsagePurpose, run: () => T): T {
  const current = storage.getStore();
  return current ? storage.run({ ...current, purpose }, run) : run();
}

function record(model: string, purpose: UsagePurpose | undefined, input: number | undefined, output: number | undefined) {
  const context = storage.getStore();
  if (!context) return; // not inside a user's request (scripts, tests): nothing to log
  void Promise.resolve(
    context.supabase.from("usage_logs").insert({
      user_id: context.userId,
      model,
      purpose: purpose ?? context.purpose,
      input_tokens: input ?? null,
      output_tokens: output ?? null,
    }),
  ).then(({ error }) => {
    if (error) console.error("Kullanım kaydı yazılamadı:", error.message);
  });
}

export const languageUsageMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate, model }) => {
    const result = await doGenerate();
    record(model.modelId, undefined, result.usage.inputTokens.total, result.usage.outputTokens.total);
    return result;
  },
  wrapStream: async ({ doStream, model }) => {
    const { stream, ...rest } = await doStream();
    const logged = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk.type === "finish") {
            record(model.modelId, undefined, chunk.usage.inputTokens.total, chunk.usage.outputTokens.total);
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return { stream: logged, ...rest };
  },
};

export const embeddingUsageMiddleware: EmbeddingModelMiddleware = {
  wrapEmbed: async ({ doEmbed, model }) => {
    const result = await doEmbed();
    record(model.modelId, "embed", result.usage?.tokens, 0);
    return result;
  },
};
