import { describe, expect, it } from "vitest";
import { embeddingsEnabled } from "@/lib/ai/models";
import { buildOrQuery } from "@/lib/rag/text-query";

describe("buildOrQuery", () => {
  it("joins significant words as OR-ed prefix terms", () => {
    expect(buildOrQuery("Laplace dönüşümü nedir?")).toBe("Laplac:* | dönüşü:*");
  });

  it("cuts words to a stem so suffixes still match", () => {
    expect(buildOrQuery("diferansiyeller")).toBe("difera:*");
  });

  it("drops stop words and very short words", () => {
    expect(buildOrQuery("bu ne ve o bir")).toBe("");
  });

  it("removes duplicates that share a stem", () => {
    expect(buildOrQuery("entropi entropiyi entropinin")).toBe("entrop:*");
  });

  it("never lets tsquery syntax through", () => {
    const query = buildOrQuery("a' | !b & (c) <-> sıcaklık:*; drop table");
    expect(query).not.toMatch(/['!&()<>;]/);
    expect(query.split(" | ").every((term) => /^[\p{L}\p{N}]+:\*$/u.test(term))).toBe(true);
  });

  it("keeps at most 12 terms", () => {
    // Distinct stems (the first six letters differ), otherwise duplicates would collapse.
    const words = Array.from({ length: 20 }, (_, i) => `${String.fromCharCode(97 + i)}xxxxxxx`).join(" ");
    expect(buildOrQuery(words).split(" | ")).toHaveLength(12);
  });
});

describe("embeddingsEnabled", () => {
  it("is on unless AI_EMBEDDINGS=off", () => {
    const previous = process.env.AI_EMBEDDINGS;
    try {
      delete process.env.AI_EMBEDDINGS;
      expect(embeddingsEnabled()).toBe(true);
      process.env.AI_EMBEDDINGS = "on";
      expect(embeddingsEnabled()).toBe(true);
      process.env.AI_EMBEDDINGS = " OFF ";
      expect(embeddingsEnabled()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AI_EMBEDDINGS;
      else process.env.AI_EMBEDDINGS = previous;
    }
  });
});
