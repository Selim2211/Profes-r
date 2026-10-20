import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM, parseEmbeddingDim, reasoningSettings } from "@/lib/ai/models";

describe("models", () => {
  it("defaults embedding dimension to 768", () => {
    expect(EMBEDDING_DIM).toBe(768);
  });

  it("reads the dimension from a plain number", () => {
    expect(parseEmbeddingDim("1024")).toBe(1024);
  });

  it("survives values that are not a clean number", () => {
    expect(parseEmbeddingDim("768 # yorum")).toBe(768);
    expect(parseEmbeddingDim("")).toBe(768);
    expect(parseEmbeddingDim(undefined)).toBe(768);
    expect(parseEmbeddingDim("abc")).toBe(768);
    expect(parseEmbeddingDim("-5")).toBe(768);
  });

  it("sends no reasoning setting unless AI_REASONING asks for one", () => {
    expect(reasoningSettings(undefined)).toEqual({});
    expect(reasoningSettings("")).toEqual({});
    expect(reasoningSettings("on")).toEqual({});
    expect(reasoningSettings(" LOW ")).toEqual({ reasoning: { effort: "low", exclude: true } });
    expect(reasoningSettings("off")).toEqual({ reasoning: { effort: "none", exclude: true } });
  });
});
