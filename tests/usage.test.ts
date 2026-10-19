import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { embeddingUsageMiddleware, languageUsageMiddleware, withPurpose, withUsage } from "@/lib/ai/usage";

type Row = Record<string, unknown>;

// A stand-in for the Supabase client that only remembers what was inserted into usage_logs.
function fakeSupabase() {
  const rows: Row[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: async (row: Row) => {
        if (table === "usage_logs") rows.push(row);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, rows };
}

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

const model = { modelId: "test-model" } as never;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("language usage middleware", () => {
  it("logs tokens of a generate call for the owner and purpose of the surrounding work", async () => {
    const { supabase, rows } = fakeSupabase();
    const result = { content: [], usage: usage(120, 30) };

    const returned = await withUsage({ supabase, userId: "user-1" }, "chat", () =>
      languageUsageMiddleware.wrapGenerate!({ doGenerate: async () => result as never, doStream: undefined as never, params: {} as never, model }),
    );
    await flush();

    expect(returned).toBe(result); // the result passes through untouched
    expect(rows).toEqual([{ user_id: "user-1", model: "test-model", purpose: "chat", input_tokens: 120, output_tokens: 30 }]);
  });

  it("logs the usage carried by the final stream part and forwards every part", async () => {
    const { supabase, rows } = fakeSupabase();
    const parts = [{ type: "text-delta", delta: "a" }, { type: "finish", usage: usage(50, 9), finishReason: "stop" }];
    const source = new ReadableStream({
      start(controller) {
        parts.forEach((p) => controller.enqueue(p));
        controller.close();
      },
    });

    const { stream } = await withUsage({ supabase, userId: "user-2" }, "summarize", () =>
      languageUsageMiddleware.wrapStream!({ doGenerate: undefined as never, doStream: async () => ({ stream: source }) as never, params: {} as never, model }),
    );
    const seen: unknown[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(value);
    }
    await flush();

    expect(seen).toEqual(parts);
    expect(rows).toEqual([{ user_id: "user-2", model: "test-model", purpose: "summarize", input_tokens: 50, output_tokens: 9 }]);
  });

  it("uses the narrower purpose set by withPurpose", async () => {
    const { supabase, rows } = fakeSupabase();
    await withUsage({ supabase, userId: "u" }, "summarize", () =>
      withPurpose("ocr", () =>
        languageUsageMiddleware.wrapGenerate!({ doGenerate: async () => ({ usage: usage(1, 1) }) as never, doStream: undefined as never, params: {} as never, model }),
      ),
    );
    await flush();
    expect(rows[0]).toMatchObject({ purpose: "ocr" });
  });

  it("logs nothing outside a user's work (scripts, tests) and still returns the result", async () => {
    const { rows } = fakeSupabase();
    const result = { usage: usage(5, 5) };
    const returned = await languageUsageMiddleware.wrapGenerate!({ doGenerate: async () => result as never, doStream: undefined as never, params: {} as never, model });
    await flush();
    expect(returned).toBe(result);
    expect(rows).toEqual([]);
  });
});

describe("embedding usage middleware", () => {
  it("logs input tokens under the embed purpose whatever the surrounding purpose is", async () => {
    const { supabase, rows } = fakeSupabase();
    await withUsage({ supabase, userId: "u" }, "chat", () =>
      embeddingUsageMiddleware.wrapEmbed!({ doEmbed: async () => ({ embeddings: [], usage: { tokens: 77 } }) as never, params: {} as never, model }),
    );
    await flush();
    expect(rows).toEqual([{ user_id: "u", model: "test-model", purpose: "embed", input_tokens: 77, output_tokens: 0 }]);
  });
});
