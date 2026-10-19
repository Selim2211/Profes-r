import { describe, expect, it } from "vitest";
import {
  buildSections,
  normalizeOutline,
  planSectionsFromHeadings,
  planSectionsFromOutline,
  segmentsByHeadings,
} from "@/lib/summary/sections";
import { buildDigest, planDocumentSections } from "@/lib/summary/outline";

const filler = (n: number) => `Bu ${n}. paragraf notlardaki bir bilgiyi anlatır. `.repeat(30).trim();

describe("segmentsByHeadings", () => {
  it("starts a new segment at each top-level heading", () => {
    const segments = segmentsByHeadings([
      { page: 1, text: "# Giriş\n\nGiriş metni." },
      { page: 2, text: "# Kavramlar\n\nKavram metni.\n\n### Alt başlık\n\nDetay." },
    ]);
    expect(segments.map((s) => s.title)).toEqual(["Giriş", "Kavramlar"]);
    expect(segments[1].blocks.some((b) => b.text.startsWith("### Alt başlık"))).toBe(true);
  });

  it("keeps text before the first heading as an untitled segment", () => {
    const segments = segmentsByHeadings([{ page: 1, text: "Önsöz metni.\n\n# Bölüm\n\nİçerik." }]);
    expect(segments.map((s) => s.title)).toEqual([null, "Bölüm"]);
  });

  it("recognises plain-text headings", () => {
    const segments = segmentsByHeadings([{ page: 1, text: "1. Giriş\n\nMetin.\n\n2. Yöntem\n\nMetin." }]);
    expect(segments.map((s) => s.title)).toEqual(["1. Giriş", "2. Yöntem"]);
  });
});

describe("planSectionsFromHeadings", () => {
  it("merges small segments up to the target size", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ page: i + 1, text: `# Konu ${i + 1}\n\nKısa metin ${i}.` }));
    const { sections } = planSectionsFromHeadings(pages);
    expect(sections).toHaveLength(1);
    expect(sections[0].headings).toHaveLength(10);
    expect(sections[0].pageStart).toBe(1);
    expect(sections[0].pageEnd).toBe(10);
  });

  it("starts a new section when the target size is exceeded", () => {
    const pages = Array.from({ length: 6 }, (_, i) => ({ page: i + 1, text: `# Konu ${i + 1}\n\n${filler(i)}` }));
    const { sections } = planSectionsFromHeadings(pages, { targetTokens: 700, maxTokens: 5000 });
    expect(sections.length).toBeGreaterThan(1);
    sections.forEach((s) => expect(s.tokens).toBeLessThanOrEqual(1400));
  });

  it("splits a huge segment on paragraph boundaries and marks the parts", () => {
    const text = `# Uzun bölüm\n\n${Array.from({ length: 20 }, (_, i) => filler(i)).join("\n\n")}`;
    const { sections } = planSectionsFromHeadings([{ page: 1, text }], { targetTokens: 1000, maxTokens: 1500 });
    expect(sections.length).toBeGreaterThan(1);
    sections.forEach((s) => expect(s.tokens).toBeLessThanOrEqual(1500 + 50));
    expect(sections[1].title).toBe("Uzun bölüm (devam)");
  });

  it("covers every page in order with page markers", () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({ page: i + 1, text: `# Konu ${i + 1}\n\n${filler(i)}` }));
    const { sections } = planSectionsFromHeadings(pages, { targetTokens: 800, maxTokens: 5000 });

    const covered = new Set<number>();
    let previousEnd = 0;
    for (const s of sections) {
      expect(s.pageStart).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = s.pageEnd;
      for (let p = s.pageStart; p <= s.pageEnd; p++) covered.add(p);
      expect(s.text).toContain(`[s.${s.pageStart}]`);
    }
    expect([...covered].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sections.map((s) => s.index)).toEqual(sections.map((_, i) => i));
  });

  it("asks for an outline only when long notes have no headings", () => {
    const longPlain = Array.from({ length: 20 }, (_, i) => ({ page: i + 1, text: filler(i) }));
    expect(planSectionsFromHeadings(longPlain).needsOutline).toBe(true);

    const shortPlain = [{ page: 1, text: "Kısa bir not metni." }];
    expect(planSectionsFromHeadings(shortPlain).needsOutline).toBe(false);

    const headed = [{ page: 1, text: `# Başlık\n\n${filler(1)}` }];
    expect(planSectionsFromHeadings(headed).needsOutline).toBe(false);
  });
});

describe("outline", () => {
  const pages = Array.from({ length: 12 }, (_, i) => ({ page: i + 1, text: filler(i) }));

  it("normalizes entries: unknown pages, duplicates and blanks are dropped, order is fixed", () => {
    const result = normalizeOutline(
      [
        { title: "Son", startPage: 9 },
        { title: "İlk", startPage: 1 },
        { title: "Yok", startPage: 99 },
        { title: "  ", startPage: 4 },
        { title: "Kopya", startPage: 1 },
      ],
      pages,
    );
    expect(result).toEqual([
      { title: "İlk", startPage: 1 },
      { title: "Son", startPage: 9 },
    ]);
  });

  it("splits sections at the outline's start pages", () => {
    const sections = planSectionsFromOutline(
      pages,
      [
        { title: "A", startPage: 1 },
        { title: "B", startPage: 7 },
      ],
      { targetTokens: 100, maxTokens: 20_000 },
    );
    expect(sections.map((s) => [s.title, s.pageStart, s.pageEnd])).toEqual([
      ["A", 1, 6],
      ["B", 7, 12],
    ]);
  });

  it("uses the generated outline for notes without headings", async () => {
    const result = await planDocumentSections(
      pages,
      { targetTokens: 100, maxTokens: 20_000 },
      async () => [
        { title: "Birinci", startPage: 1 },
        { title: "İkinci", startPage: 5 },
      ],
    );
    expect(result.usedOutline).toBe(true);
    expect(result.sections.map((s) => s.title)).toEqual(["Birinci", "İkinci"]);
  });

  it("falls back to size-based sections when the outline fails or is unusable", async () => {
    const failing = await planDocumentSections(pages, {}, async () => {
      throw new Error("model hatası");
    });
    expect(failing.usedOutline).toBe(false);
    expect(failing.sections.length).toBeGreaterThan(0);

    const useless = await planDocumentSections(pages, {}, async () => [{ title: "Tek", startPage: 1 }]);
    expect(useless.usedOutline).toBe(false);
  });

  it("does not call the outline generator when headings exist", async () => {
    let called = false;
    const headed = [{ page: 1, text: `# Başlık\n\n${filler(1)}` }];
    await planDocumentSections(headed, {}, async () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
  });
});

describe("buildDigest", () => {
  it("gives every non-empty page a short tagged excerpt within budget", () => {
    const pages = Array.from({ length: 200 }, (_, i) => ({ page: i + 1, text: "x".repeat(2000) }));
    const digest = buildDigest(pages, 20_000);
    expect(digest.split("\n")).toHaveLength(200);
    expect(digest.length).toBeLessThanOrEqual(24_000);
    expect(digest.startsWith("[s.1] ")).toBe(true);
  });

  it("skips empty pages", () => {
    expect(buildDigest([{ page: 1, text: " " }, { page: 2, text: "metin" }])).toBe("[s.2] metin");
  });
});

describe("buildSections", () => {
  it("returns nothing for no segments", () => {
    expect(buildSections([])).toEqual([]);
  });
});
