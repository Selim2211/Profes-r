import { describe, expect, it } from "vitest";
import type { SectionNotes } from "@/lib/ai/schemas";
import {
  emptyNotes,
  mapSections,
  noteCount,
  normalizeNotes,
  sourceHash,
  type SectionStore,
  type StoredSection,
} from "@/lib/summary/map";
import type { Section } from "@/lib/summary/sections";

function section(index: number, text = `metin ${index}`): Section {
  return { index, title: `Bölüm ${index}`, headings: [`Bölüm ${index}`], pageStart: index * 2 + 1, pageEnd: index * 2 + 2, text, tokens: 50 };
}

function memoryStore(initial: StoredSection[] = []) {
  const rows = new Map(initial.map((r) => [r.section_index, r]));
  const store: SectionStore = {
    async list() {
      return [...rows.values()].sort((a, b) => a.section_index - b.section_index);
    },
    async save(row) {
      rows.set(row.section_index, row);
    },
    async deleteFrom(index) {
      for (const key of [...rows.keys()]) if (key >= index) rows.delete(key);
    },
  };
  return { store, rows };
}

const notesFor = (n: number): SectionNotes => ({ ...emptyNotes(), keyPoints: [{ text: `bilgi ${n}`, pages: [1] }] });

describe("sourceHash", () => {
  it("is stable for the same text and differs when the text changes", () => {
    expect(sourceHash("a")).toBe(sourceHash("a"));
    expect(sourceHash("a")).not.toBe(sourceHash("b"));
  });
});

describe("normalizeNotes", () => {
  const sec = { pageStart: 5, pageEnd: 8 };

  it("drops pages outside the section and falls back to the first page", () => {
    const notes: SectionNotes = {
      ...emptyNotes(),
      keyPoints: [
        { text: "a", pages: [6, 99, 6, 5] },
        { text: "b", pages: [99] },
        { text: "c", pages: [] },
      ],
    };
    expect(normalizeNotes(notes, sec).keyPoints.map((k) => k.pages)).toEqual([[5, 6], [5], [5]]);
  });

  it("removes blank items", () => {
    const notes: SectionNotes = {
      ...emptyNotes(),
      keyPoints: [{ text: "  ", pages: [5] }],
      definitions: [{ term: "", text: "x", pages: [5] }],
      formulas: [{ latex: " ", meaning: "m", pages: [5] }],
    };
    expect(noteCount(normalizeNotes(notes, sec))).toBe(0);
  });
});

describe("mapSections", () => {
  it("maps every section and stores the results", async () => {
    const { store, rows } = memoryStore();
    const calls: number[] = [];
    const result = await mapSections({
      sections: [section(0), section(1), section(2)],
      store,
      mapper: async (s) => {
        calls.push(s.index);
        return notesFor(s.index);
      },
      maxCalls: 10,
    });

    expect(result).toEqual({ done: true, nextIndex: 3, mapped: 3, reused: 0 });
    expect(calls).toEqual([0, 1, 2]);
    expect(rows.get(1)).toMatchObject({ title: "Bölüm 1", page_start: 3, page_end: 4, source_hash: sourceHash("metin 1") });
  });

  it("reuses stored results whose text is unchanged and re-maps changed ones", async () => {
    const stored = (i: number, text: string): StoredSection => ({
      section_index: i, title: `Bölüm ${i}`, page_start: i * 2 + 1, page_end: i * 2 + 2,
      source_hash: sourceHash(text), content: notesFor(i),
    });
    const { store } = memoryStore([stored(0, "metin 0"), stored(1, "ESKİ metin")]);
    const calls: number[] = [];

    const result = await mapSections({
      sections: [section(0), section(1)],
      store,
      mapper: async (s) => {
        calls.push(s.index);
        return notesFor(s.index);
      },
    });

    expect(calls).toEqual([1]);
    expect(result).toMatchObject({ done: true, mapped: 1, reused: 1 });
  });

  it("stops after maxCalls and resumes from nextIndex", async () => {
    const { store, rows } = memoryStore();
    const sections = [section(0), section(1), section(2), section(3), section(4)];
    const mapper = async (s: Section) => notesFor(s.index);

    const first = await mapSections({ sections, store, mapper, maxCalls: 2 });
    expect(first).toMatchObject({ done: false, nextIndex: 2, mapped: 2 });
    expect(rows.size).toBe(2);

    const second = await mapSections({ sections, store, mapper, startIndex: first.nextIndex, maxCalls: 2 });
    expect(second).toMatchObject({ done: false, nextIndex: 4 });

    const third = await mapSections({ sections, store, mapper, startIndex: second.nextIndex, maxCalls: 2 });
    expect(third).toMatchObject({ done: true, nextIndex: 5 });
    expect(rows.size).toBe(5);
  });

  it("removes stored sections that no longer exist", async () => {
    const stale: StoredSection = {
      section_index: 4, title: "Eski", page_start: 9, page_end: 10, source_hash: "x", content: emptyNotes(),
    };
    const { store, rows } = memoryStore([stale]);
    await mapSections({ sections: [section(0)], store, mapper: async (s) => notesFor(s.index) });
    expect([...rows.keys()]).toEqual([0]);
  });

  it("propagates mapper errors without storing a partial result", async () => {
    const { store, rows } = memoryStore();
    await expect(
      mapSections({
        sections: [section(0)],
        store,
        mapper: async () => {
          throw new Error("model hatası");
        },
      }),
    ).rejects.toThrow("model hatası");
    expect(rows.size).toBe(0);
  });
});
