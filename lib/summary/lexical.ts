import { normalizeForMatch } from "./coverage";

// Cheap, model-free check that a claim is a near copy of a passage of the notes: when (almost) every content
// word and every number of the claim occurs within ONE or two neighbouring lines/sentences of a chunk, asking a
// model would only cost tokens. Looking at a small window (not the whole chunk) matters: a claim built from
// words that merely appear somewhere in a 3000-character chunk is not backed by it. The shortcut only fires
// when summary and notes share a language and the claim is close to the wording; everything else goes to the
// model.

const MIN_CLAIM_WORDS = 6;
const MAX_MISSING_RATIO = 0.08; // below ~13 words this means every word must be found
const MIN_WORD_CHARS = 4;
// One line/sentence only: with two neighbouring sentences a claim could glue together parts of different
// statements ("Taktik düzey ... yönetim içindir") and still look like a copy.
const MAX_WINDOW_PIECES = 1;
const MAX_QUOTE_CHARS = 300;

// Words that flip a statement's meaning: if the claim has one that the window lacks, do not auto-accept.
const NEGATIONS = ["degil", "yok", "olmaz", "olmayan", "asla", "hicbir", "haric", "disinda", "not", "never", "without"].map(
  (w) => normalizeForMatch(w),
);

const tokens = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeForMatch).filter(Boolean);

const isContentWord = (word: string) => word.length >= MIN_WORD_CHARS || /\d/.test(word);

function contentWords(text: string): string[] {
  return [...new Set(tokens(text).filter(isContentWord))];
}

export type LexicalHit = { chunkIndex: number; quote: string };

// Lines and sentences of a chunk, in order.
function pieces(content: string): string[] {
  return content
    .split(/\n+|(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Returns the chunk that holds a near copy of the claim, with that passage as the quote, or null when a model must decide.
export function lexicalSupport(claimText: string, chunks: { content: string }[]): LexicalHit | null {
  const words = contentWords(claimText);
  if (words.length < MIN_CLAIM_WORDS) return null;

  const numbers = words.filter((w) => /\d/.test(w));
  const allowedMissing = Math.floor(words.length * MAX_MISSING_RATIO);
  const claimNegations = tokens(claimText).filter((w) => NEGATIONS.includes(w));

  // A holder object, because TypeScript cannot see assignments made inside the forEach callback.
  const found: { best: { chunkIndex: number; missing: number; quote: string } | null } = { best: null };

  chunks.forEach((chunk, chunkIndex) => {
    const parts = pieces(chunk.content);
    for (let start = 0; start < parts.length; start++) {
      for (let size = 1; size <= MAX_WINDOW_PIECES && start + size <= parts.length; size++) {
        const window = parts.slice(start, start + size).join(" ");
        const available = new Set(tokens(window));
        if (numbers.some((n) => !available.has(n))) continue; // a changed or invented number is never "close enough"
        if (claimNegations.some((n) => !available.has(n))) continue;

        const missing = words.filter((w) => !available.has(w)).length;
        if (missing <= allowedMissing && (!found.best || missing < found.best.missing)) {
          found.best = { chunkIndex, missing, quote: window.slice(0, MAX_QUOTE_CHARS) };
        }
      }
    }
  });

  return found.best ? { chunkIndex: found.best.chunkIndex, quote: found.best.quote } : null;
}
