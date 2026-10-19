import { describe, expect, it } from "vitest";
import { fitChunksToBudget } from "@/lib/rag/week";

const chunk = (i: number, size = 100) => ({ id: `c${i}`, content: "x".repeat(size) });

describe("fitChunksToBudget", () => {
  it("keeps everything when under budget", () => {
    const chunks = [chunk(1), chunk(2)];
    expect(fitChunksToBudget(chunks, 1000)).toEqual({ chunks, truncated: false });
  });

  it("samples evenly across the week and stays within budget", () => {
    const chunks = Array.from({ length: 40 }, (_, i) => chunk(i));
    const result = fitChunksToBudget(chunks, 1000);
    const used = result.chunks.reduce((sum, c) => sum + c.content.length, 0);

    expect(result.truncated).toBe(true);
    expect(used).toBeLessThanOrEqual(1000);
    // Both the beginning and the end of the week stay represented.
    const indexes = result.chunks.map((c) => Number(c.id.slice(1)));
    expect(Math.min(...indexes)).toBeLessThan(8);
    expect(Math.max(...indexes)).toBeGreaterThan(30);
  });

  it("always returns at least one chunk", () => {
    const result = fitChunksToBudget([chunk(0, 5000), chunk(1, 5000)], 100);
    expect(result.chunks.length).toBeGreaterThanOrEqual(1);
  });
});
