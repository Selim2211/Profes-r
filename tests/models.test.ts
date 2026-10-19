import { describe, expect, it } from "vitest";
import { EMBEDDING_DIM } from "@/lib/ai/models";

describe("models", () => {
  it("defaults embedding dimension to 768", () => {
    expect(EMBEDDING_DIM).toBe(768);
  });
});
