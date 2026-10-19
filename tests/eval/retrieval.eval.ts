import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeForMatch } from "@/lib/summary/coverage";
import { evalClient, findDocument, report } from "./helpers";

const TARGET_HIT_RATE = 0.85;

type Question = { q: string; pages: number[]; keywords: string[] };
const { document: title, questions } = JSON.parse(readFileSync("tests/eval/questions.json", "utf8")) as {
  document: string;
  questions: Question[];
};

describe("arama değerlendirmesi", () => {
  it(`doğru parça ilk 8 sonuçta (hedef ≥ %${TARGET_HIT_RATE * 100})`, async () => {
    const { searchNotes } = await import("@/lib/rag/search");
    const supabase = evalClient();
    const docs = await findDocument(supabase, title);
    expect(docs.length, `"${title}" dokümanı bulunamadı`).toBeGreaterThan(0);
    const doc = docs[0];

    let hits = 0;
    const misses: string[] = [];
    for (const question of questions) {
      const results = (await searchNotes(supabase, { query: question.q, courseId: doc.course_id })).filter(
        (r) => r.document_id === doc.id,
      );
      // A hit needs both: a chunk covering the expected page, and the expected terms in that chunk.
      const hit = results.some(
        (r) =>
          question.pages.some((p) => p >= r.page_start && p <= r.page_end) &&
          question.keywords.every((k) => normalizeForMatch(r.content).includes(normalizeForMatch(k))),
      );
      if (hit) hits++;
      else misses.push(question.q);
    }

    const rate = hits / questions.length;
    report(`ARAMA: ${hits}/${questions.length} soruda doğru parça ilk 8'de (%${(rate * 100).toFixed(1)}), hedef ≥ %${TARGET_HIT_RATE * 100}`);
    if (misses.length) report(`  Bulunamayan: ${misses.join(" | ")}`);
    report("  Not: örnek doküman 2 büyük parçaya bölündüğü için bu ölçüm şimdilik kolay; daha uzun dokümanlarda anlamlı hale gelir.");
    expect(rate).toBeGreaterThanOrEqual(TARGET_HIT_RATE);
  }, 300_000);
});
