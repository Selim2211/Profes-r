import { describe, expect, it } from "vitest";
import { parseOcrOutput } from "@/lib/ingest/ocr";
import { splitTextIntoPages } from "@/lib/ingest/extract";
import { fitToBudget } from "@/lib/ingest/summarize";

describe("parseOcrOutput", () => {
  it("splits model output by page markers", () => {
    const parsed = parseOcrOutput("<<<PAGE 2>>>\n# Başlık\nMetin\n<<<PAGE 3>>>\n\n<<<PAGE 5>>>\nSon");
    expect(parsed.get(2)).toBe("# Başlık\nMetin");
    expect(parsed.get(3)).toBe("");
    expect(parsed.get(5)).toBe("Son");
  });

  it("returns an empty map when there are no markers", () => {
    expect(parseOcrOutput("sadece metin").size).toBe(0);
  });
});

describe("splitTextIntoPages", () => {
  it("groups paragraphs into numbered virtual pages", () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i} `.repeat(300)).join("\n\n");
    const pages = splitTextIntoPages(text);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((p) => p.page)).toEqual(pages.map((_, i) => i + 1));
  });
});

describe("fitToBudget", () => {
  it("returns everything when under budget", () => {
    expect(fitToBudget(["a", "b"], 100)).toBe("a\n\nb");
  });

  it("samples across the whole input when over budget", () => {
    const parts = Array.from({ length: 100 }, (_, i) => `parça-${i}`.padEnd(100, "x"));
    const result = fitToBudget(parts, 2000);
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain("parça-0");
    expect(result).toMatch(/parça-9\d/);
  });
});
