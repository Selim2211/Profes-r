import { generateObject, generateText } from "ai";
import { chatModel, fastModel } from "@/lib/ai/models";
import { MERGE_NOTES_PROMPT, REDUCE_PROMPT } from "@/lib/ai/prompts";
import { sectionNotesSchema, type SectionNotes } from "@/lib/ai/schemas";
import { normalizeCitationTags } from "@/lib/rag/citations";
import { withRetry } from "@/lib/utils/retry";
import { normalizeNotes } from "./map";
import { groupEntries, serializeEntries, totalTokens, type NoteEntry, type TagFor } from "./notes";
import { LEVEL_INSTRUCTIONS, fillEmptySections, missingHeadings, type SummaryLevel } from "./template";

// If the serialized notes fit this budget they are written up in one call; otherwise groups of
// neighbouring sections are merged first (hierarchical reduce), repeating until they fit.
export const REDUCE_INPUT_BUDGET_TOKENS = 28_000;
export const GROUP_BUDGET_TOKENS = 12_000;
const MAX_REDUCE_ROUNDS = 3;

export type ReduceDeps = {
  // Merges the notes of several neighbouring sections into one structured note.
  mergeGroup(group: NoteEntry[], tagFor: TagFor): Promise<SectionNotes>;
  // Writes the final markdown summary from serialized notes. `feedback` is set on the retry.
  write(args: { notes: string; level: SummaryLevel; courseName: string; scopeLabel: string; feedback?: string }): Promise<string>;
};

export type ReduceResult = {
  contentMd: string;
  // How many merge rounds were needed (0 when everything fit in one call).
  rounds: number;
  // How many group merges were made across all rounds.
  groupMerges: number;
};

export const modelDeps: ReduceDeps = {
  async mergeGroup(group, tagFor) {
    const { object } = await withRetry(() =>
      generateObject({
        model: fastModel(),
        schema: sectionNotesSchema,
        system: MERGE_NOTES_PROMPT,
        temperature: 0,
        prompt: `<notlar>\n${serializeEntries(group, tagFor)}\n</notlar>`,
      }),
    );
    return normalizeNotes(object, {
      pageStart: Math.min(...group.map((e) => e.pageStart)),
      pageEnd: Math.max(...group.map((e) => e.pageEnd)),
    });
  },

  async write({ notes, level, courseName, scopeLabel, feedback }) {
    const { text } = await withRetry(() =>
      generateText({
        model: chatModel(),
        system: `${REDUCE_PROMPT}\n\n${LEVEL_INSTRUCTIONS[level]}`,
        temperature: 0,
        prompt: `Ders: ${courseName}\nKapsam: ${scopeLabel}\n\n<notlar>\n${notes}\n</notlar>${feedback ? `\n\n${feedback}` : ""}`,
      }),
    );
    return normalizeCitationTags(text.trim());
  },
};

function mergedEntry(group: NoteEntry[], notes: SectionNotes): NoteEntry {
  const titles = [group[0].title, group[group.length - 1].title].filter((t, i, all) => t && all.indexOf(t) === i);
  return {
    title: titles.join(" – ") || null,
    pageStart: Math.min(...group.map((e) => e.pageStart)),
    pageEnd: Math.max(...group.map((e) => e.pageEnd)),
    notes,
  };
}

// Writes the final summary from all section notes, merging groups first when they are too large.
export async function reduceToSummary(args: {
  entries: NoteEntry[];
  tagFor: TagFor;
  level: SummaryLevel;
  courseName: string;
  scopeLabel: string;
  deps?: ReduceDeps;
}): Promise<ReduceResult> {
  const { tagFor, level, courseName, scopeLabel, deps = modelDeps } = args;
  if (args.entries.length === 0) throw new Error("Özet için bölüm notu bulunamadı.");

  let entries = args.entries;
  let rounds = 0;
  let groupMerges = 0;

  while (totalTokens(entries, tagFor) > REDUCE_INPUT_BUDGET_TOKENS && rounds < MAX_REDUCE_ROUNDS) {
    const groups = groupEntries(entries, tagFor, GROUP_BUDGET_TOKENS);
    if (groups.length === entries.length) break; // no neighbours to merge; the writer gets it as is

    const next: NoteEntry[] = [];
    for (const group of groups) {
      if (group.length === 1) {
        next.push(group[0]);
        continue;
      }
      next.push(mergedEntry(group, await deps.mergeGroup(group, tagFor)));
      groupMerges++;
    }
    entries = next;
    rounds++;
  }

  const notes = serializeEntries(entries, tagFor);
  let contentMd = await deps.write({ notes, level, courseName, scopeLabel });

  // The template is fixed: if headings are missing, ask once more, then give up loudly.
  let missing = missingHeadings(contentMd);
  if (missing.length > 0) {
    contentMd = await deps.write({
      notes,
      level,
      courseName,
      scopeLabel,
      feedback: `Önceki denemende şu başlıklar eksikti: ${missing.join("; ")}. Şablondaki yedi başlığın hepsini, adlarını değiştirmeden yaz.`,
    });
    missing = missingHeadings(contentMd);
    if (missing.length > 0) throw new Error(`Özet şablonu eksik kaldı: ${missing.join("; ")}`);
  }

  return { contentMd: fillEmptySections(contentMd), rounds, groupMerges };
}
