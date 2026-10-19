import { describe, expect, it } from "vitest";
import type { SectionNotes } from "@/lib/ai/schemas";
import {
  applyAdditions,
  buildChecklist,
  ensureCoverage,
  evidenceHolds,
  literalCovered,
  normalizeForMatch,
  type CoverageDeps,
} from "@/lib/summary/coverage";
import { makeTagFor, type NoteEntry } from "@/lib/summary/notes";
import { SUMMARY_HEADINGS } from "@/lib/summary/template";

const tagFor = makeTagFor(2);

const notes = (n: Partial<SectionNotes>): SectionNotes => ({
  keyPoints: [], definitions: [], formulas: [], examples: [], warnings: [], ...n,
});

const entries: NoteEntry[] = [
  {
    title: "Laplace Dönüşümü",
    pageStart: 1,
    pageEnd: 3,
    notes: notes({
      definitions: [{ term: "Laplace dönüşümü", text: "integral dönüşümü", pages: [1] }],
      formulas: [{ latex: "F(s)=\\int_0^\\infty f(t)e^{-st}dt", meaning: "tanım", pages: [2] }],
      examples: [{ text: "f(t)=1 için F(s)=1/s", pages: [3] }],
      warnings: [{ text: "s>0 koşulu unutulmamalı", pages: [3] }],
      keyPoints: [{ text: "Dönüşüm doğrusaldır", pages: [2] }],
    }),
  },
];

const summary = SUMMARY_HEADINGS.map((h, i) => `## ${i + 1}. ${h}\n\n${i === 3 ? "Notlarda formül yok." : "İçerik."}`).join("\n\n");

describe("normalizeForMatch: I/ı/İ folding", () => {
  it("matches English words regardless of capital I", () => {
    expect(normalizeForMatch("Executive Information Systems")).toBe(normalizeForMatch("executive information systems"));
    expect(normalizeForMatch("INFORMATION")).toBe(normalizeForMatch("information"));
  });

  it("still matches Turkish words typed with either i or ı casing", () => {
    expect(normalizeForMatch("BAKIŞ")).toBe(normalizeForMatch("bakış"));
    expect(normalizeForMatch("İŞLEM")).toBe(normalizeForMatch("işlem"));
  });
});

describe("normalizeForMatch", () => {
  it("ignores case, spaces, punctuation and LaTeX spacing, with Turkish casing", () => {
    expect(normalizeForMatch("BAKIŞ, Açısı")).toBe(normalizeForMatch("bakış açısı"));
    expect(normalizeForMatch("F(s) = \\int_0^\\infty")).toBe(normalizeForMatch("F(s)=\\int_0^\\infty"));
  });
});

describe("buildChecklist", () => {
  it("covers headings, definitions, formulas and warnings for the short level", () => {
    const kinds = buildChecklist(entries, tagFor, "short").map((i) => i.kind);
    expect(kinds).toEqual(["heading", "definition", "formula", "warning"]);
  });

  it("adds examples for standard and key points for detailed", () => {
    expect(buildChecklist(entries, tagFor, "standard").map((i) => i.kind)).toContain("example");
    expect(buildChecklist(entries, tagFor, "standard").map((i) => i.kind)).not.toContain("keyPoint");
    expect(buildChecklist(entries, tagFor, "detailed").map((i) => i.kind)).toContain("keyPoint");
  });

  it("carries source tags in the item text and numbers items sequentially", () => {
    const items = buildChecklist(entries, tagFor, "detailed");
    expect(items.map((i) => i.id)).toEqual(items.map((_, i) => i));
    expect(items.find((i) => i.kind === "formula")?.text).toContain("[H2 · s.2]");
  });

  it("adds finer-grained topics as heading items with their notes text, without duplicating section titles", () => {
    const topics = [
      { title: "Anthony Üçgeni", content: "Üç katmanlı piramit: stratejik, taktik, operasyonel.", pageStart: 5, pageEnd: 5 },
      { title: "Laplace Dönüşümü", content: "tanım", pageStart: 1, pageEnd: 3 },
    ];
    const items = buildChecklist(entries, tagFor, "short", topics);
    const headings = items.filter((i) => i.kind === "heading");

    expect(headings.map((i) => i.label)).toEqual(["Anthony Üçgeni", "Laplace Dönüşümü"]);
    expect(headings[0].text).toContain("Üç katmanlı piramit");
    expect(headings[0].text).toContain("[H2 · s.5]");
  });

  it("never lets a heading count as covered just because its name appears", () => {
    const items = buildChecklist(entries, tagFor, "short", [
      { title: "Anthony Üçgeni", content: "içerik", pageStart: 5, pageEnd: 5 },
    ]);
    const heading = items.find((i) => i.kind === "heading")!;
    expect(literalCovered(heading, normalizeForMatch("Anthony Üçgeni konu başlığı."))).toBe(false);
  });

  it("removes duplicates across sections", () => {
    const twice = [...entries, { ...entries[0], title: "Başka" }];
    const items = buildChecklist(twice, tagFor, "standard");
    expect(items.filter((i) => i.kind === "definition")).toHaveLength(1);
  });
});

describe("evidenceHolds", () => {
  const summaryNorm = normalizeForMatch("Anthony Üçgeni, bilişim sistemlerini üç katmanda sınıflandırır [H1 · s.5].");

  it("accepts a quote that occurs in the summary, ignoring case and punctuation", () => {
    expect(evidenceHolds("anthony üçgeni, bilişim sistemlerini üç katmanda", summaryNorm)).toBe(true);
  });

  it("rejects invented, too short or empty evidence", () => {
    expect(evidenceHolds("Tarihsel gelişim beş dönemde incelenir", summaryNorm)).toBe(false);
    expect(evidenceHolds("üç", summaryNorm)).toBe(false);
    expect(evidenceHolds("", summaryNorm)).toBe(false);
  });
});

describe("literalCovered", () => {
  const item = buildChecklist(entries, tagFor, "short").find((i) => i.kind === "definition")!;

  it("matches the term inside the summary", () => {
    expect(literalCovered(item, normalizeForMatch("Burada LAPLACE dönüşümü anlatılır."))).toBe(true);
    expect(literalCovered(item, normalizeForMatch("Başka bir konu."))).toBe(false);
  });

  it("never matches very short needles", () => {
    const tiny = { ...item, literal: "x" };
    expect(literalCovered(tiny, "xxxxxxxx")).toBe(false);
  });
});

describe("applyAdditions", () => {
  it("appends to the end of the named section and keeps the rest", () => {
    const result = applyAdditions(summary, [{ section: 2, markdown: "- Yeni tanım [H2 · s.1]" }]);
    const lines = result.split("\n");
    const added = lines.indexOf("- Yeni tanım [H2 · s.1]");
    expect(added).toBeGreaterThan(lines.findIndex((l) => l.includes("Temel kavramlar")));
    expect(added).toBeLessThan(lines.findIndex((l) => l.includes("Konu konu anlatım")));
    expect(result).toContain("## 7. Kendini kontrol et");
  });

  it("removes 'Notlarda ... yok.' placeholders from a section that gets content", () => {
    const result = applyAdditions(summary, [{ section: 4, markdown: "- $F(s)$ formülü [H2 · s.2]" }]);
    expect(result).not.toContain("Notlarda formül yok.");
    expect(result).toContain("$F(s)$ formülü");
  });

  it("falls back to the explanation section when the target heading is missing", () => {
    const withoutExamples = summary.replace("## 5. Örnekler", "## 5. Başka");
    const result = applyAdditions(withoutExamples, [{ section: 5, markdown: "- Örnek [H2 · s.3]" }]);
    expect(result).toContain("- Örnek [H2 · s.3]");
  });

  it("ignores empty additions", () => {
    expect(applyAdditions(summary, [{ section: 3, markdown: "  " }])).toBe(summary);
  });
});

function fakeDeps(options: { coveredIds?: number[]; afterSupplement?: boolean } = {}) {
  const calls = { judge: [] as number[][], supplement: [] as number[][] };
  let supplemented = false;
  const deps: CoverageDeps = {
    async judge(_md, items) {
      calls.judge.push(items.map((i) => i.id));
      if (supplemented && options.afterSupplement) return new Set(items.map((i) => i.id));
      return new Set(items.filter((i) => options.coveredIds?.includes(i.id)).map((i) => i.id));
    },
    async supplement(_md, missing) {
      supplemented = true;
      calls.supplement.push(missing.map((i) => i.id));
      return [{ section: 3, markdown: "- Eklenen madde [H2 · s.1]" }];
    },
  };
  return { deps, calls };
}

describe("ensureCoverage", () => {
  const args = { entries, tagFor, level: "standard" as const };

  it("skips the model for items found verbatim (headings are always judged)", async () => {
    const full = `${summary}\n\nLaplace dönüşümü, F(s)=\\int_0^\\infty f(t)e^{-st}dt, f(t)=1 için F(s)=1/s, s>0 koşulu unutulmamalı`;
    const heading = buildChecklist(entries, tagFor, "standard").find((i) => i.kind === "heading")!;
    const { deps, calls } = fakeDeps({ coveredIds: [heading.id] });
    const { report, contentMd } = await ensureCoverage({ ...args, summaryMd: full, deps });

    expect(calls.judge).toEqual([[heading.id]]); // only the heading needed the model
    expect(calls.supplement).toEqual([]);
    expect(report).toMatchObject({ coverage: 1, rounds: 0, judgeCalls: 1 });
    expect(contentMd).toBe(full);
  });

  it("supplements missing items, rechecks only those, and reports the final ratio", async () => {
    const { deps, calls } = fakeDeps({ afterSupplement: true });
    const { report, contentMd } = await ensureCoverage({ ...args, summaryMd: summary, deps });

    expect(calls.supplement).toHaveLength(1);
    expect(calls.judge).toHaveLength(2);
    expect(calls.judge[1]).toEqual(calls.supplement[0]); // second look = the missing items only
    expect(contentMd).toContain("- Eklenen madde [H2 · s.1]");
    expect(report.coverage).toBe(1);
    expect(report.coveredBefore).toBeLessThan(report.total);
  });

  it("stops after two supplement rounds and lists what is still missing", async () => {
    const { deps, calls } = fakeDeps(); // never judged as covered
    const { report } = await ensureCoverage({ ...args, summaryMd: summary, deps });

    expect(calls.supplement).toHaveLength(2);
    expect(report.coverage).toBe(0);
    expect(report.missing.length).toBe(report.total);
    expect(report.rounds).toBe(2);
  });

  it("treats notes with nothing to check as fully covered", async () => {
    const { deps } = fakeDeps();
    const { report } = await ensureCoverage({ entries: [], tagFor, level: "short", summaryMd: summary, deps });
    expect(report).toMatchObject({ total: 0, coverage: 1 });
  });
});
