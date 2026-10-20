import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM, parseEmbeddingDim } from "@/lib/ai/models";

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
});
