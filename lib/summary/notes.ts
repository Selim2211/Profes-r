import type { SectionNotes } from "@/lib/ai/schemas";
import { estimateTokens } from "@/lib/ingest/chunk";

// One section's worth of notes, ready to be merged or written up.
export type NoteEntry = {
  title: string | null;
  pageStart: number;
  pageEnd: number;
  notes: SectionNotes;
};

// Turns a page number into the source tag shown in answers, e.g. "[H3 · s.12]".
export type TagFor = (page: number) => string;

export function makeTagFor(weekNumber: number | null): TagFor {
  return (page) => `[${weekNumber === null ? "Not" : `H${weekNumber}`} · s.${page}]`;
}

const tags = (pages: number[], tagFor: TagFor) => [...new Set(pages)].map(tagFor).join(" ");

// Compact text form of the notes; every item carries the tags the writer must copy.
export function serializeEntry(entry: NoteEntry, tagFor: TagFor): string {
  const { notes } = entry;
  const lines = [`### ${entry.title ?? "(başlıksız bölüm)"} (sayfa ${entry.pageStart}-${entry.pageEnd})`];

  if (notes.keyPoints.length) {
    lines.push("Önemli noktalar:", ...notes.keyPoints.map((n) => `- ${n.text} ${tags(n.pages, tagFor)}`));
  }
  if (notes.definitions.length) {
    lines.push("Tanımlar:", ...notes.definitions.map((n) => `- ${n.term}: ${n.text} ${tags(n.pages, tagFor)}`));
  }
  if (notes.formulas.length) {
    lines.push("Formüller:", ...notes.formulas.map((n) => `- $${n.latex}$ — ${n.meaning} ${tags(n.pages, tagFor)}`));
  }
  if (notes.examples.length) {
    lines.push("Örnekler:", ...notes.examples.map((n) => `- ${n.text} ${tags(n.pages, tagFor)}`));
  }
  if (notes.warnings.length) {
    lines.push("Uyarılar:", ...notes.warnings.map((n) => `- ${n.text} ${tags(n.pages, tagFor)}`));
  }
  return lines.join("\n");
}

export function serializeEntries(entries: NoteEntry[], tagFor: TagFor): string {
  return entries.map((e) => serializeEntry(e, tagFor)).join("\n\n");
}

export function entryTokens(entry: NoteEntry, tagFor: TagFor): number {
  return estimateTokens(serializeEntry(entry, tagFor));
}

// Groups consecutive entries so each group's serialized notes stay within the budget.
// An entry larger than the budget forms its own group.
export function groupEntries(entries: NoteEntry[], tagFor: TagFor, budgetTokens: number): NoteEntry[][] {
  const groups: NoteEntry[][] = [];
  let current: NoteEntry[] = [];
  let used = 0;

  for (const entry of entries) {
    const tokens = entryTokens(entry, tagFor);
    if (current.length > 0 && used + tokens > budgetTokens) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(entry);
    used += tokens;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function totalTokens(entries: NoteEntry[], tagFor: TagFor): number {
  return entries.reduce((sum, e) => sum + entryTokens(e, tagFor), 0);
}
