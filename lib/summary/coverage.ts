import { generateStructured } from "@/lib/ai/structured";
import { chatModel } from "@/lib/ai/models";
import { COVERAGE_JUDGE_PROMPT, COVERAGE_SUPPLEMENT_PROMPT } from "@/lib/ai/prompts";
import { additionsSchema, coverageJudgeSchema } from "@/lib/ai/schemas";
import { normalizeCitationTags } from "@/lib/rag/citations";
import { withRetry } from "@/lib/utils/retry";
import type { NoteEntry, TagFor } from "./notes";
import { SUMMARY_HEADINGS, type SummaryLevel } from "./template";

export type ChecklistKind = "heading" | "definition" | "formula" | "warning" | "example" | "keyPoint";

export type ChecklistItem = {
  id: number;
  kind: ChecklistKind;
  // Short text shown in reports.
  label: string;
  // Full text the judge and the supplement writer see, with source tags.
  text: string;
  // When set and found verbatim in the summary, the item counts as covered without a model call.
  literal?: string;
};

export type Addition = { section: number; markdown: string };

export type CoverageReport = {
  total: number;
  coveredBefore: number;
  coveredAfter: number;
  // coveredAfter / total, 0..1 (1 when there is nothing to check).
  coverage: number;
  missing: { kind: ChecklistKind; label: string }[];
  rounds: number;
  judgeCalls: number;
  supplementCalls: number;
};

export type CoverageDeps = {
  // Returns the ids of the items the summary covers.
  judge(summaryMd: string, items: ChecklistItem[]): Promise<Set<number>>;
  supplement(summaryMd: string, missing: ChecklistItem[]): Promise<Addition[]>;
};

// Which kinds of notes a summary level is expected to cover. A short summary only has to mention
// every topic, term, formula and warning; the longer ones must also carry examples and key points.
export const KINDS_BY_LEVEL: Record<SummaryLevel, ChecklistKind[]> = {
  short: ["heading", "definition", "formula", "warning"],
  standard: ["heading", "definition", "formula", "warning", "example"],
  detailed: ["heading", "definition", "formula", "warning", "example", "keyPoint"],
};

const JUDGE_BATCH_SIZE = 40;
const MAX_SUPPLEMENT_ROUNDS = 2;
const LABEL_LENGTH = 90;

const shorten = (text: string, length = LABEL_LENGTH) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);
const tagsOf = (pages: number[], tagFor: TagFor) => [...new Set(pages)].map(tagFor).join(" ");

// Lowercase (Turkish rules), no spaces/punctuation/LaTeX markup: makes "Hardware" match "hardware," etc.
export function normalizeForMatch(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    // Turkish lowercasing turns English "I" into "ı" (dotless) while a typed "i" stays "i", so
    // "Information" would not match "information". Folding ı to i makes both sides agree.
    .replace(/ı/g, "i")
    .replace(/\\(left|right|,|;|!|quad|cdot)\b/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

// A heading found in the notes themselves (e.g. a slide title) with the text written under it.
export type Topic = { title: string; content: string; pageStart: number; pageEnd: number };

const TOPIC_CONTENT_CHARS = 1500;

// The outline of what the notes contain, built from the original (unmerged) section notes.
// `topics` are the headings found in the notes themselves: they are finer-grained than section
// titles, so a dropped topic inside a big section is still noticed. A topic item carries the notes'
// own text, so the judge can compare it and a supplement can be written from it. Headings never
// count as covered just because their name appears (that would be trivial to game).
export function buildChecklist(
  entries: NoteEntry[],
  tagFor: TagFor,
  level: SummaryLevel,
  topics: Topic[] = [],
): ChecklistItem[] {
  const kinds = new Set(KINDS_BY_LEVEL[level]);
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();

  const add = (kind: ChecklistKind, label: string, text: string, literal?: string) => {
    if (!kinds.has(kind)) return;
    const key = `${kind}:${normalizeForMatch(label)}`;
    if (!normalizeForMatch(label) || seen.has(key)) return;
    seen.add(key);
    items.push({ id: items.length, kind, label: shorten(label), text, literal });
  };

  for (const topic of topics) {
    const pages = [...new Set([topic.pageStart, topic.pageEnd])];
    add(
      "heading",
      topic.title,
      `Konu: ${topic.title} ${tagsOf(pages, tagFor)}\nNotlardaki içerik: ${shorten(topic.content.replace(/\s+/g, " ").trim(), TOPIC_CONTENT_CHARS)}`,
    );
  }

  for (const entry of entries) {
    if (entry.title) {
      add("heading", entry.title, `Konu: ${entry.title} ${tagsOf([entry.pageStart, entry.pageEnd], tagFor)} (bölüm başlığı)`);
    }
    const { notes } = entry;
    for (const n of notes.definitions) {
      add("definition", n.term, `Tanım — ${n.term}: ${n.text} ${tagsOf(n.pages, tagFor)}`, n.term);
    }
    for (const n of notes.formulas) {
      add("formula", n.latex, `Formül — $${n.latex}$: ${n.meaning} ${tagsOf(n.pages, tagFor)}`, n.latex);
    }
    for (const n of notes.warnings) add("warning", n.text, `Uyarı — ${n.text} ${tagsOf(n.pages, tagFor)}`, n.text);
    for (const n of notes.examples) add("example", n.text, `Örnek — ${n.text} ${tagsOf(n.pages, tagFor)}`, n.text);
    for (const n of notes.keyPoints) add("keyPoint", n.text, `Bilgi — ${n.text} ${tagsOf(n.pages, tagFor)}`, n.text);
  }
  return items;
}

// Items whose key term/formula already appears in the summary need no model call.
export function literalCovered(item: ChecklistItem, summaryNormalized: string): boolean {
  if (!item.literal) return false;
  const needle = normalizeForMatch(item.literal);
  // Very short needles ("a", "x") would match everywhere.
  return needle.length >= 4 && summaryNormalized.includes(needle);
}

const MIN_EVIDENCE_CHARS = 12;

// A "covered" verdict only counts when the quoted evidence really occurs in the summary.
export function evidenceHolds(evidence: string, summaryNormalized: string): boolean {
  const needle = normalizeForMatch(evidence);
  return needle.length >= MIN_EVIDENCE_CHARS && summaryNormalized.includes(needle);
}

const SECTION_LINE = /^##\s/;

function sectionBounds(lines: string[], section: number): { start: number; end: number } | null {
  const needle = SUMMARY_HEADINGS[section - 1].toLocaleLowerCase("tr-TR");
  const start = lines.findIndex((l) => SECTION_LINE.test(l) && l.toLocaleLowerCase("tr-TR").includes(needle));
  if (start === -1) return null;
  const next = lines.findIndex((l, i) => i > start && SECTION_LINE.test(l));
  return { start, end: next === -1 ? lines.length : next };
}

const PLACEHOLDER_LINE = /^\s*notlarda\b.*\byok\.?\s*$/i;

// Appends each addition to the end of its template section, leaving the rest of the summary as is.
// "Notlarda ... yok." placeholders in a section that receives content are removed.
export function applyAdditions(markdown: string, additions: Addition[]): string {
  let lines = markdown.split("\n");

  for (const addition of additions) {
    const body = addition.markdown.trim();
    if (!body) continue;

    const bounds = sectionBounds(lines, addition.section) ?? sectionBounds(lines, 3);
    if (!bounds) {
      lines = [...lines, "", body];
      continue;
    }
    const kept = lines.slice(bounds.start + 1, bounds.end).filter((l) => !PLACEHOLDER_LINE.test(l));
    while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();

    lines = [
      ...lines.slice(0, bounds.start + 1),
      ...kept,
      "",
      ...body.split("\n"),
      "",
      ...lines.slice(bounds.end),
    ];
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export const modelCoverageDeps: CoverageDeps = {
  async judge(summaryMd, items) {
    const list = items.map((i) => `${i.id}. ${i.text}`).join("\n");
    const object = await withRetry(() =>
      generateStructured({
        model: chatModel(), // a sloppy judge marks everything as covered, so the stronger model is used
        schema: coverageJudgeSchema,
        system: COVERAGE_JUDGE_PROMPT,
        temperature: 0,
        prompt: `<ozet>\n${summaryMd}\n</ozet>\n\n<maddeler>\n${list}\n</maddeler>`,
      }),
    );
    const wanted = new Set(items.map((i) => i.id));
    const summaryNormalized = normalizeForMatch(summaryMd);
    return new Set(
      object.results
        .filter((r) => r.covered && wanted.has(r.id) && evidenceHolds(r.evidence, summaryNormalized))
        .map((r) => r.id),
    );
  },

  async supplement(summaryMd, missing) {
    const list = missing.map((i) => `- ${i.text}`).join("\n");
    const object = await withRetry(() =>
      generateStructured({
        model: chatModel(),
        schema: additionsSchema,
        system: COVERAGE_SUPPLEMENT_PROMPT,
        temperature: 0,
        prompt: `<ozet>\n${summaryMd}\n</ozet>\n\n<eksik_maddeler>\n${list}\n</eksik_maddeler>`,
      }),
    );
    return object.additions.map((a) => ({ ...a, markdown: normalizeCitationTags(a.markdown) }));
  },
};

async function judgeAll(
  deps: CoverageDeps,
  summaryMd: string,
  items: ChecklistItem[],
  counter: { calls: number },
): Promise<Set<number>> {
  const normalized = normalizeForMatch(summaryMd);
  const covered = new Set<number>();
  const toJudge: ChecklistItem[] = [];

  for (const item of items) {
    if (literalCovered(item, normalized)) covered.add(item.id);
    else toJudge.push(item);
  }
  for (let i = 0; i < toJudge.length; i += JUDGE_BATCH_SIZE) {
    counter.calls++;
    for (const id of await deps.judge(summaryMd, toJudge.slice(i, i + JUDGE_BATCH_SIZE))) covered.add(id);
  }
  return covered;
}

// Checks that every item of the notes' outline is covered by the summary, has the model add what is
// missing (up to two rounds), and reports the final coverage ratio.
export async function ensureCoverage(args: {
  summaryMd: string;
  entries: NoteEntry[];
  tagFor: TagFor;
  level: SummaryLevel;
  topics?: Topic[];
  deps?: CoverageDeps;
}): Promise<{ contentMd: string; report: CoverageReport }> {
  const { entries, tagFor, level, topics = [], deps = modelCoverageDeps } = args;
  const items = buildChecklist(entries, tagFor, level, topics);
  let contentMd = args.summaryMd;

  const judgeCounter = { calls: 0 };
  let supplementCalls = 0;
  let rounds = 0;

  if (items.length === 0) {
    return {
      contentMd,
      report: { total: 0, coveredBefore: 0, coveredAfter: 0, coverage: 1, missing: [], rounds, judgeCalls: 0, supplementCalls },
    };
  }

  const covered = await judgeAll(deps, contentMd, items, judgeCounter);
  const coveredBefore = covered.size;

  while (rounds < MAX_SUPPLEMENT_ROUNDS) {
    const missing = items.filter((i) => !covered.has(i.id));
    if (missing.length === 0) break;

    supplementCalls++;
    contentMd = applyAdditions(contentMd, await deps.supplement(contentMd, missing));
    rounds++;

    // Only the previously missing items need a second look, against the extended summary.
    for (const id of await judgeAll(deps, contentMd, missing, judgeCounter)) covered.add(id);
  }

  const stillMissing = items.filter((i) => !covered.has(i.id));
  return {
    contentMd,
    report: {
      total: items.length,
      coveredBefore,
      coveredAfter: covered.size,
      coverage: covered.size / items.length,
      missing: stillMissing.map((i) => ({ kind: i.kind, label: i.label })),
      rounds,
      judgeCalls: judgeCounter.calls,
      supplementCalls,
    },
  };
}
