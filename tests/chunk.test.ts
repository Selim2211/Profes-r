import { describe, expect, it } from "vitest";
import { chunkPages, estimateTokens } from "@/lib/ingest/chunk";

const paragraph = (n: number) => `Bu ${n}. paragraf. `.repeat(40).trim();

describe("chunkPages", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([{ page: 1, text: "   " }])).toEqual([]);
  });

  it("keeps a short document in a single chunk with page info", () => {
    const chunks = chunkPages([
      { page: 1, text: "Giriş\n\nKısa bir metin." },
      { page: 2, text: "İkinci sayfa metni." },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, pageStart: 1, pageEnd: 2 });
  });

  it("splits long content near the target size and tracks pages", () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({
      page: i + 1,
      text: [paragraph(i * 2), paragraph(i * 2 + 1)].join("\n\n"),
    }));
    const chunks = chunkPages(pages, { targetTokens: 300, overlapTokens: 60 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.tokenCount).toBeLessThanOrEqual(300);
      expect(chunk.pageStart).toBeLessThanOrEqual(chunk.pageEnd);
    });
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[chunks.length - 1].pageEnd).toBe(6);
  });

  it("overlaps neighbouring chunks", () => {
    const text = Array.from({ length: 12 }, (_, i) => paragraph(i).slice(0, 200)).join("\n\n");
    const chunks = chunkPages([{ page: 1, text }], { targetTokens: 150, overlapTokens: 60 });
    expect(chunks.length).toBeGreaterThan(1);
    const lastParagraphOfFirst = chunks[0].content.split("\n\n").pop()!;
    expect(chunks[1].content).toContain(lastParagraphOfFirst);
  });

  it("splits an oversized paragraph on sentence boundaries", () => {
    const sentence = "Bu bir cümledir ve oldukça uzundur. ";
    const chunks = chunkPages([{ page: 1, text: sentence.repeat(200) }], {
      targetTokens: 100,
      overlapTokens: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(estimateTokens(c.content)).toBeLessThanOrEqual(100));
  });

  it("records the heading a chunk belongs to", () => {
    const chunks = chunkPages([
      { page: 1, text: "# Laplace Dönüşümü\n\nTanım ve özellikleri burada anlatılır." },
    ]);
    expect(chunks[0].heading).toBe("Laplace Dönüşümü");
  });
});
