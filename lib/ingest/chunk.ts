import type { PageText } from "./clean";

export type Chunk = {
  index: number;
  pageStart: number;
  pageEnd: number;
  heading: string | null;
  content: string;
  tokenCount: number;
};

export type ChunkOptions = {
  targetTokens?: number;
  overlapTokens?: number;
};

type Unit = { text: string; page: number; heading: string | null; tokens: number };

const DEFAULT_TARGET_TOKENS = 800;
const DEFAULT_OVERLAP_TOKENS = 120;
const MAX_HEADING_LENGTH = 80;

// Rough estimate (about 4 characters per token); good enough for sizing chunks.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function headingOf(paragraph: string): string | null {
  const line = paragraph.trim();
  if (!line || line.includes("\n")) return null;

  const markdown = line.match(/^#{1,6}\s+(.+)$/);
  if (markdown) return markdown[1].trim();

  if (line.length > MAX_HEADING_LENGTH || /[.!?;,:]$/.test(line)) return null;

  const numbered = /^(\d+(\.\d+)*[.)]?|[IVXLC]+\.)\s+\S/.test(line);
  const letters = line.replace(/[^\p{L}]/gu, "");
  const upper = letters.length >= 3 && letters === letters.toLocaleUpperCase("tr-TR");
  return numbered || upper ? line : null;
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?\n]+(?:[.!?]+|\n|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

// Splits an oversized paragraph on sentence boundaries, hard-splitting only when a sentence is still too long.
function splitLong(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const parts: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) parts.push(current.trim());
    current = "";
  };

  for (const sentence of splitSentences(text)) {
    if (sentence.length > maxChars) {
      flush();
      for (let i = 0; i < sentence.length; i += maxChars) {
        parts.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }
    if (current && current.length + sentence.length + 1 > maxChars) flush();
    current += (current ? " " : "") + sentence;
  }
  flush();
  return parts;
}

function toUnits(pages: PageText[], maxUnitTokens: number): Unit[] {
  const units: Unit[] = [];
  let heading: string | null = null;

  for (const { page, text } of pages) {
    for (const paragraph of text.split(/\n{2,}/)) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      const found = headingOf(trimmed);
      if (found) heading = found;

      const pieces =
        estimateTokens(trimmed) > maxUnitTokens ? splitLong(trimmed, maxUnitTokens) : [trimmed];
      for (const piece of pieces) {
        units.push({ text: piece, page, heading, tokens: estimateTokens(piece) });
      }
    }
  }
  return units;
}

function buildChunk(index: number, units: Unit[]): Chunk {
  const content = units.map((u) => u.text).join("\n\n");
  return {
    index,
    pageStart: units[0].page,
    pageEnd: units[units.length - 1].page,
    heading: units[0].heading,
    content,
    tokenCount: estimateTokens(content),
  };
}

// Pure function: groups paragraphs into ~target-token chunks with token overlap between neighbours.
export function chunkPages(pages: PageText[], options: ChunkOptions = {}): Chunk[] {
  const target = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlap = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const units = toUnits(pages, target);

  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let currentTokens = 0;
  let newTokens = 0; // tokens added since the last chunk was emitted (excludes carried overlap)

  for (const unit of units) {
    if (current.length > 0 && currentTokens + unit.tokens > target) {
      chunks.push(buildChunk(chunks.length, current));

      const carried: Unit[] = [];
      let carriedTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        if (carriedTokens + current[i].tokens > overlap) break;
        carried.unshift(current[i]);
        carriedTokens += current[i].tokens;
      }
      current = carried;
      currentTokens = carriedTokens;
      newTokens = 0;
    }
    current.push(unit);
    currentTokens += unit.tokens;
    newTokens += unit.tokens;
  }

  if (current.length > 0 && newTokens > 0) {
    chunks.push(buildChunk(chunks.length, current));
  }
  return chunks;
}
