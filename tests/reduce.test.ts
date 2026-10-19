import { describe, expect, it } from "vitest";
import type { SectionNotes } from "@/lib/ai/schemas";
import { groupEntries, makeTagFor, serializeEntry, type NoteEntry } from "@/lib/summary/notes";
import { GROUP_BUDGET_TOKENS, reduceToSummary, type ReduceDeps } from "@/lib/summary/reduce";
import { LEVEL_INSTRUCTIONS, SUMMARY_HEADINGS, TEMPLATE_TEXT, fillEmptySections, missingHeadings } from "@/lib/summary/template";

const tagFor = makeTagFor(3);

function notes(overrides: Partial<SectionNotes> = {}): SectionNotes {
  return { keyPoints: [], definitions: [], formulas: [], examples: [], warnings: [], ...overrides };
}

function entry(i: number, size = 0): NoteEntry {
  return {
    title: `Bölüm ${i}`,
    pageStart: i * 3 + 1,
    pageEnd: i * 3 + 3,
    notes: notes({ keyPoints: [{ text: `bilgi ${i} ` + "uzun ".repeat(size), pages: [i * 3 + 1] }] }),
  };
}

const fullSummary = SUMMARY_HEADINGS.map((h, i) => `## ${i + 1}. ${h}\n\nİçerik.`).join("\n\n");

describe("template", () => {
  it("has seven headings and all levels have instructions", () => {
    expect(SUMMARY_HEADINGS).toHaveLength(7);
    expect(TEMPLATE_TEXT.split("\n")).toHaveLength(7);
    expect(Object.keys(LEVEL_INSTRUCTIONS).sort()).toEqual(["detailed", "short", "standard"]);
  });

  it("reports missing headings, ignoring numbering and case", () => {
    expect(missingHeadings(fullSummary)).toEqual([]);
    expect(missingHeadings("## GENEL BAKIŞ\n\n## 5. Örnekler")).toHaveLength(5);
    expect(missingHeadings("Genel bakış yazısı ama başlık değil")).toHaveLength(7);
  });
});

describe("fillEmptySections", () => {
  it("fills sections that have no body and leaves filled ones alone", () => {
    const md = ["## 1. Genel bakış", "", "Metin.", "", "## 4. Formüller ve kurallar", "", "## 6. Sık yapılan hatalar / dikkat edilecekler", "", "## 7. Kendini kontrol et", ""].join("\n");
    const out = fillEmptySections(md);

    expect(out).toContain("## 4. Formüller ve kurallar\n\nNotlarda formül yok.");
    expect(out).toContain("## 6. Sık yapılan hatalar / dikkat edilecekler\n\nNotlarda bu konuda özel bir uyarı yok.");
    expect(out).toContain("## 7. Kendini kontrol et\n\nNotlarda bu bölüm için içerik yok.");
    expect(out).toContain("## 1. Genel bakış\n\nMetin.");
    expect(out.match(/Notlarda formül yok/g)).toHaveLength(1);
  });

  it("is a no-op for a complete summary", () => {
    expect(fillEmptySections(fullSummary)).toBe(fullSummary);
  });
});

describe("serializeEntry", () => {
  it("lists items with source tags and omits empty groups", () => {
    const text = serializeEntry(
      {
        title: "Laplace",
        pageStart: 4,
        pageEnd: 6,
        notes: notes({
          definitions: [{ term: "Laplace dönüşümü", text: "integral dönüşümü", pages: [4, 5] }],
          formulas: [{ latex: "F(s)=\\int_0^\\infty f(t)e^{-st}dt", meaning: "tanım", pages: [5] }],
        }),
      },
      tagFor,
    );
    expect(text).toContain("### Laplace (sayfa 4-6)");
    expect(text).toContain("- Laplace dönüşümü: integral dönüşümü [H3 · s.4] [H3 · s.5]");
    expect(text).toContain("$F(s)=\\int_0^\\infty f(t)e^{-st}dt$ — tanım [H3 · s.5]");
    expect(text).not.toContain("Örnekler:");
  });

  it("uses the 'Not' tag for notes without a week", () => {
    expect(makeTagFor(null)(7)).toBe("[Not · s.7]");
  });
});

describe("groupEntries", () => {
  it("keeps small entries together and splits when the budget is exceeded", () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(i, 200));
    expect(groupEntries(entries, tagFor, 100_000)).toHaveLength(1);

    const groups = groupEntries(entries, tagFor, 300);
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.flat().map((e) => e.title)).toEqual(entries.map((e) => e.title)); // order kept
  });

  it("gives an oversized entry its own group", () => {
    const groups = groupEntries([entry(0), entry(1, 5000), entry(2)], tagFor, 200);
    expect(groups.map((g) => g.length)).toEqual([1, 1, 1]);
  });
});

function fakeDeps(writes: string[] = [fullSummary]) {
  const calls = { merges: [] as number[], writes: [] as { notes: string; feedback?: string }[] };
  const deps: ReduceDeps = {
    async mergeGroup(group) {
      calls.merges.push(group.length);
      return notes({ keyPoints: [{ text: `birleşik ${group.length}`, pages: [group[0].pageStart] }] });
    },
    async write(args) {
      calls.writes.push({ notes: args.notes, feedback: args.feedback });
      return writes[Math.min(calls.writes.length - 1, writes.length - 1)];
    },
  };
  return { deps, calls };
}

describe("reduceToSummary", () => {
  const base = { tagFor, level: "standard" as const, courseName: "Ders", scopeLabel: "3. hafta" };

  it("writes directly when the notes fit in one call", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reduceToSummary({ ...base, entries: [entry(0), entry(1)], deps });
    expect(result).toMatchObject({ rounds: 0, groupMerges: 0, contentMd: fullSummary });
    expect(calls.merges).toEqual([]);
    expect(calls.writes).toHaveLength(1);
  });

  it("merges groups hierarchically when the notes are too large", async () => {
    const { deps, calls } = fakeDeps();
    // ~40k tokens of notes: more than the single-call budget, split into several groups.
    const entries = Array.from({ length: 12 }, (_, i) => entry(i, 3200));
    const result = await reduceToSummary({ ...base, entries, deps });

    expect(result.rounds).toBeGreaterThanOrEqual(1);
    expect(result.groupMerges).toBeGreaterThan(0);
    expect(calls.merges.every((n) => n >= 2)).toBe(true);
    expect(calls.writes).toHaveLength(1);
    expect(GROUP_BUDGET_TOKENS).toBeGreaterThan(0);
  });

  it("retries once when template headings are missing", async () => {
    const { deps, calls } = fakeDeps(["## Genel bakış\n\nSadece bu.", fullSummary]);
    const result = await reduceToSummary({ ...base, entries: [entry(0)], deps });
    expect(result.contentMd).toBe(fullSummary);
    expect(calls.writes).toHaveLength(2);
    expect(calls.writes[1].feedback).toContain("eksikti");
  });

  it("fails loudly if the template is still incomplete after the retry", async () => {
    const { deps } = fakeDeps(["## Genel bakış\n\nYetersiz."]);
    await expect(reduceToSummary({ ...base, entries: [entry(0)], deps })).rejects.toThrow("şablonu eksik");
  });

  it("rejects an empty note list", async () => {
    await expect(reduceToSummary({ ...base, entries: [], deps: fakeDeps().deps })).rejects.toThrow("bulunamadı");
  });
});
