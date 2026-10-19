import { estimateTokens, headingOf } from "@/lib/ingest/chunk";
import type { PageText } from "@/lib/ingest/clean";

export type Section = {
  index: number;
  // First heading inside the section; null when the section has none.
  title: string | null;
  // Every heading in the section, in order. The outline used by the coverage check.
  headings: string[];
  pageStart: number;
  pageEnd: number;
  // Section text with "[s.N]" markers at the start of each page, so notes can be traced to pages.
  text: string;
  tokens: number;
};

export type SectionOptions = {
  // Neighbouring segments are merged until a section reaches about this size.
  targetTokens?: number;
  // A single segment larger than this is split on paragraph boundaries.
  maxTokens?: number;
};

export type OutlineEntry = { title: string; startPage: number };

export const DEFAULT_TARGET_TOKENS = 6_000;
export const DEFAULT_MAX_TOKENS = 11_000;

type Block = { page: number; text: string };
export type Segment = { title: string | null; blocks: Block[]; tokens: number };

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/;
// Only top-level headings start a new segment; deeper ones stay inside their parent.
const MAX_SEGMENT_HEADING_LEVEL = 2;

function newSegment(title: string | null): Segment {
  return { title, blocks: [], tokens: 0 };
}

function addBlock(segment: Segment, block: Block) {
  segment.blocks.push(block);
  segment.tokens += estimateTokens(block.text);
}

// A heading that should start a new segment, or null for body text.
function segmentHeading(paragraph: string): string | null {
  const line = paragraph.trim();
  const markdown = line.match(MARKDOWN_HEADING);
  if (markdown) return markdown[1].length <= MAX_SEGMENT_HEADING_LEVEL ? markdown[2].trim() : null;
  return headingOf(line);
}

function paragraphsOf(page: PageText): Block[] {
  return page.text
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ page: page.page, text }));
}

// Splits the notes at headings. Text before the first heading forms an untitled segment.
export function segmentsByHeadings(pages: PageText[]): Segment[] {
  const segments: Segment[] = [];
  let current = newSegment(null);

  for (const page of pages) {
    for (const block of paragraphsOf(page)) {
      const heading = segmentHeading(block.text);
      if (heading && current.blocks.length > 0) {
        segments.push(current);
        current = newSegment(null);
      }
      if (heading && current.title === null) current.title = heading;
      addBlock(current, block);
    }
  }
  if (current.blocks.length > 0) segments.push(current);
  return segments;
}

// Splits at the page numbers the outline names. Pages before the first entry join the first section.
export function segmentsByOutline(pages: PageText[], outline: OutlineEntry[]): Segment[] {
  const starts = [...outline].sort((a, b) => a.startPage - b.startPage);
  const segments: Segment[] = [];
  let current = newSegment(null);
  let next = 0;

  for (const page of pages) {
    while (next < starts.length && starts[next].startPage <= page.page) {
      if (current.blocks.length > 0) {
        segments.push(current);
        current = newSegment(null);
      }
      current.title = starts[next].title;
      next++;
    }
    for (const block of paragraphsOf(page)) addBlock(current, block);
  }
  if (current.blocks.length > 0) segments.push(current);
  return segments;
}

// Cuts an oversized segment into parts that each fit the limit, on paragraph boundaries.
function splitSegment(segment: Segment, maxTokens: number): Segment[] {
  if (segment.tokens <= maxTokens) return [segment];

  const parts: Segment[] = [];
  let part = newSegment(segment.title);
  for (const block of segment.blocks) {
    const tokens = estimateTokens(block.text);
    if (part.blocks.length > 0 && part.tokens + tokens > maxTokens) {
      parts.push(part);
      part = newSegment(segment.title ? `${segment.title} (devam)` : null);
    }
    addBlock(part, block);
  }
  if (part.blocks.length > 0) parts.push(part);
  return parts;
}

function buildSection(index: number, segments: Segment[]): Section {
  const blocks = segments.flatMap((s) => s.blocks);
  const lines: string[] = [];
  let lastPage = -1;
  for (const block of blocks) {
    if (block.page !== lastPage) {
      lines.push(`[s.${block.page}]`);
      lastPage = block.page;
    }
    lines.push(block.text);
  }
  const headings = segments.map((s) => s.title).filter((t): t is string => Boolean(t));
  const text = lines.join("\n\n");

  return {
    index,
    title: headings[0] ?? null,
    headings,
    pageStart: blocks[0].page,
    pageEnd: blocks[blocks.length - 1].page,
    text,
    tokens: estimateTokens(text),
  };
}

// Merges small neighbouring segments up to the target size and splits oversized ones.
export function buildSections(segments: Segment[], options: SectionOptions = {}): Section[] {
  const target = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const max = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  const sections: Section[] = [];
  let group: Segment[] = [];
  let groupTokens = 0;

  const flush = () => {
    if (group.length > 0) sections.push(buildSection(sections.length, group));
    group = [];
    groupTokens = 0;
  };

  for (const segment of segments.flatMap((s) => splitSegment(s, max))) {
    if (group.length > 0 && groupTokens + segment.tokens > target) flush();
    group.push(segment);
    groupTokens += segment.tokens;
  }
  flush();
  return sections;
}

export type SectionPlan = {
  sections: Section[];
  // True when the notes have no usable headings and are long enough to need an outline.
  needsOutline: boolean;
};

// Plans sections from the headings in the notes. When `outline` is given it is used instead.
export function planSectionsFromHeadings(pages: PageText[], options: SectionOptions = {}): SectionPlan {
  const segments = segmentsByHeadings(pages);
  const titled = segments.filter((s) => s.title !== null).length;
  const totalTokens = segments.reduce((sum, s) => sum + s.tokens, 0);

  return {
    sections: buildSections(segments, options),
    needsOutline: titled === 0 && totalTokens > (options.targetTokens ?? DEFAULT_TARGET_TOKENS),
  };
}

export function planSectionsFromOutline(
  pages: PageText[],
  outline: OutlineEntry[],
  options: SectionOptions = {},
): Section[] {
  return buildSections(segmentsByOutline(pages, outline), options);
}

// Keeps only usable entries: pages inside the document, sorted, one per page, in-range titles.
export function normalizeOutline(outline: OutlineEntry[], pages: PageText[]): OutlineEntry[] {
  if (pages.length === 0) return [];
  const known = new Set(pages.map((p) => p.page));
  const byPage = new Map<number, OutlineEntry>();
  for (const entry of outline) {
    const title = entry.title.trim();
    if (title && known.has(entry.startPage) && !byPage.has(entry.startPage)) {
      byPage.set(entry.startPage, { title, startPage: entry.startPage });
    }
  }
  return [...byPage.values()].sort((a, b) => a.startPage - b.startPage);
}
