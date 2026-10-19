import { describe, expect, it } from "vitest";
import { citationLabel, toCitation } from "@/lib/rag/search";
import { extractCitationRefs } from "@/lib/rag/citations";

describe("citationLabel", () => {
  it("formats week and single page", () => {
    expect(citationLabel({ week_number: 3, page_start: 12, page_end: 12 })).toBe("[H3 · s.12]");
  });

  it("formats page ranges and notes without a week", () => {
    expect(citationLabel({ week_number: null, page_start: 2, page_end: 5 })).toBe("[Not · s.2-5]");
  });
});

describe("toCitation", () => {
  it("keeps the first page of the chunk", () => {
    const hit = {
      id: "c1", document_id: "d1", course_id: "k1", week_number: 3,
      page_start: 4, page_end: 6, heading: null, content: "x", score: 0.1,
    };
    expect(toCitation(hit)).toEqual({ chunk_id: "c1", document_id: "d1", week: 3, page: 4 });
  });
});

describe("extractCitationRefs", () => {
  it("finds week and page references in text", () => {
    const refs = extractCitationRefs("Tanım budur [H3 · s.12]. Örnek [H1 · s.2-4] ve [Not · s.7].");
    expect(refs).toEqual([
      { raw: "[H3 · s.12]", week: 3, page: 12 },
      { raw: "[H1 · s.2-4]", week: 1, page: 2 },
      { raw: "[Not · s.7]", week: null, page: 7 },
    ]);
  });

  it("returns nothing when there are no tags", () => {
    expect(extractCitationRefs("kaynaksız metin")).toEqual([]);
  });
});
