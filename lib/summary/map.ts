import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { fastModel } from "@/lib/ai/models";
import { MAP_PROMPT, MAP_PROMPT_VERSION } from "@/lib/ai/prompts";
import { sectionNotesSchema, type SectionNotes } from "@/lib/ai/schemas";
import { withRetry } from "@/lib/utils/retry";
import type { Section } from "./sections";

export type StoredSection = {
  section_index: number;
  title: string | null;
  page_start: number;
  page_end: number;
  source_hash: string;
  content: SectionNotes;
};

// Where MAP results live. A Supabase-backed implementation is in store.ts; tests use memory.
export interface SectionStore {
  list(): Promise<StoredSection[]>;
  save(row: StoredSection): Promise<void>;
  // Removes rows from this index on (sections that no longer exist).
  deleteFrom(index: number): Promise<void>;
}

export type SectionMapper = (section: Section) => Promise<SectionNotes>;

export type MapProgress = {
  done: boolean;
  // Index of the first section not processed yet (== sections.length when done).
  nextIndex: number;
  mapped: number;
  reused: number;
};

// A section is re-summarized only when its text (or the prompt/schema version) changed.
export function sourceHash(sectionText: string): string {
  return createHash("sha256").update(`${MAP_PROMPT_VERSION}\n${sectionText}`).digest("hex");
}

export function emptyNotes(): SectionNotes {
  return { keyPoints: [], definitions: [], formulas: [], examples: [], warnings: [] };
}

export function noteCount(notes: SectionNotes): number {
  return (
    notes.keyPoints.length +
    notes.definitions.length +
    notes.formulas.length +
    notes.examples.length +
    notes.warnings.length
  );
}

// Keeps page references inside the section; items left without a valid page fall back to its first page.
export function normalizeNotes(notes: SectionNotes, section: Pick<Section, "pageStart" | "pageEnd">): SectionNotes {
  const fixPages = (pages: number[]) => {
    const valid = [...new Set(pages.filter((p) => p >= section.pageStart && p <= section.pageEnd))].sort((a, b) => a - b);
    return valid.length > 0 ? valid : [section.pageStart];
  };
  const clean = <T extends { pages: number[] }>(items: T[]) =>
    items.map((item) => ({ ...item, pages: fixPages(item.pages) }));

  return {
    keyPoints: clean(notes.keyPoints.filter((n) => n.text.trim())),
    definitions: clean(notes.definitions.filter((n) => n.term.trim() && n.text.trim())),
    formulas: clean(notes.formulas.filter((n) => n.latex.trim())),
    examples: clean(notes.examples.filter((n) => n.text.trim())),
    warnings: clean(notes.warnings.filter((n) => n.text.trim())),
  };
}

// Sections this big with no extracted notes at all mean the model skipped the work.
const MIN_TOKENS_EXPECTING_NOTES = 120;

export function createSectionMapper(courseName: string): SectionMapper {
  return async (section) => {
    const notes = await withRetry(async () => {
      const { object } = await generateObject({
        model: fastModel(),
        schema: sectionNotesSchema,
        system: MAP_PROMPT,
        temperature: 0,
        prompt: `Ders: ${courseName}\nBölüm: ${section.title ?? "(başlıksız)"} (sayfa ${section.pageStart}-${section.pageEnd})\n\n<notlar>\n${section.text}\n</notlar>`,
      });
      const normalized = normalizeNotes(object, section);
      if (noteCount(normalized) === 0 && section.tokens >= MIN_TOKENS_EXPECTING_NOTES) {
        throw new Error("Model bu bölümden hiç not çıkarmadı.");
      }
      return normalized;
    });
    return notes;
  };
}

// Maps sections one by one, reusing stored results whose text hash is unchanged.
// At most `maxCalls` model calls are made per invocation so each request stays short;
// call again with the returned nextIndex until done.
export async function mapSections(args: {
  sections: Section[];
  store: SectionStore;
  mapper: SectionMapper;
  startIndex?: number;
  maxCalls?: number;
}): Promise<MapProgress> {
  const { sections, store, mapper, startIndex = 0, maxCalls = 2 } = args;
  const existing = new Map((await store.list()).map((row) => [row.section_index, row]));

  let calls = 0;
  let reused = 0;
  for (let i = startIndex; i < sections.length; i++) {
    const section = sections[i];
    const hash = sourceHash(section.text);
    const stored = existing.get(i);

    if (stored && stored.source_hash === hash) {
      reused++;
      continue;
    }
    if (calls >= maxCalls) return { done: false, nextIndex: i, mapped: calls, reused };

    const content = await mapper(section);
    await store.save({
      section_index: i,
      title: section.title,
      page_start: section.pageStart,
      page_end: section.pageEnd,
      source_hash: hash,
      content,
    });
    calls++;
  }

  await store.deleteFrom(sections.length);
  return { done: true, nextIndex: sections.length, mapped: calls, reused };
}
