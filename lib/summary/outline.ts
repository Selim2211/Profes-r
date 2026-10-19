import { generateObject } from "ai";
import { fastModel } from "@/lib/ai/models";
import { OUTLINE_PROMPT } from "@/lib/ai/prompts";
import { outlineSchema } from "@/lib/ai/schemas";
import type { PageText } from "@/lib/ingest/clean";
import {
  normalizeOutline,
  planSectionsFromHeadings,
  planSectionsFromOutline,
  type OutlineEntry,
  type Section,
  type SectionOptions,
} from "./sections";

const DIGEST_CHAR_BUDGET = 40_000;
const MAX_SNIPPET_CHARS = 400;
const MIN_SNIPPET_CHARS = 80;

// One short excerpt per page, shortened further for long documents so the outline call stays small.
export function buildDigest(pages: PageText[], budget = DIGEST_CHAR_BUDGET): string {
  const perPage = Math.max(MIN_SNIPPET_CHARS, Math.min(MAX_SNIPPET_CHARS, Math.floor(budget / Math.max(pages.length, 1)) - 12));
  return pages
    .filter((p) => p.text.trim())
    .map((p) => `[s.${p.page}] ${p.text.replace(/\s+/g, " ").trim().slice(0, perPage)}`)
    .join("\n");
}

export type OutlineGenerator = (pages: PageText[]) => Promise<OutlineEntry[]>;

// Fast-model fallback for notes without headings.
export const generateOutline: OutlineGenerator = async (pages) => {
  const { object } = await generateObject({
    model: fastModel(),
    schema: outlineSchema,
    system: OUTLINE_PROMPT,
    prompt: `<alintilar>\n${buildDigest(pages)}\n</alintilar>`,
  });
  return object.sections;
};

// Sections from headings when the notes have them, otherwise from a model-made outline.
// If the outline call fails or is unusable, the heading-based plan (merged/split by size) is kept.
export async function planDocumentSections(
  pages: PageText[],
  options: SectionOptions = {},
  outlineGenerator: OutlineGenerator = generateOutline,
): Promise<{ sections: Section[]; usedOutline: boolean; outline: OutlineEntry[] | null }> {
  const plan = planSectionsFromHeadings(pages, options);
  if (!plan.needsOutline) return { sections: plan.sections, usedOutline: false, outline: null };

  try {
    const outline = normalizeOutline(await outlineGenerator(pages), pages);
    if (outline.length >= 2) {
      return { sections: planSectionsFromOutline(pages, outline, options), usedOutline: true, outline };
    }
  } catch {
    // Fall through to the size-based sections.
  }
  return { sections: plan.sections, usedOutline: false, outline: null };
}

// Rebuilds the sections of an earlier plan. A model-made outline is not repeatable, so the job stores
// it and passes it back here; without an outline the (deterministic) heading-based plan is used.
export function replanSections(pages: PageText[], outline: OutlineEntry[] | null, options: SectionOptions = {}): Section[] {
  return outline ? planSectionsFromOutline(pages, outline, options) : planSectionsFromHeadings(pages, options).sections;
}
