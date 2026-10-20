// Decides which pages need a faithful re-transcription from the PDF image, and checks the result.

export type TranscribeReason = "table" | "math" | "diagram" | "garbled";

export type TranscribeNeed = { needed: boolean; reasons: TranscribeReason[] };

const MATH_SYMBOLS = /[∑∫√∂∞≈≠≤≥±×÷∈∉⊂⊆∪∩→⇒⇔∀∃λμσπθΔΩΣαβγδεφψω]/g;
const LATEX_TOKENS = /\\(frac|sum|int|sqrt|lim|alpha|beta|theta|lambda|mu|sigma|pi)\b/; // no /g flag: .test() on a global regex keeps state between calls
const TABLE_WORDS = /\b(table|tablo|çizelge)\s*\d*\b/i;
const REPLACEMENT_CHARS = /[�-]/g;

const MIN_LINES_FOR_DIAGRAM = 6;
const SHORT_LINE_MAX_WORDS = 4;
const DIAGRAM_SHORT_RATIO = 0.7;
const DIAGRAM_MAX_AVG_CHARS = 22;

function lineList(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

function looksLikeTable(text: string, lines: string[]): boolean {
  if (TABLE_WORDS.test(text)) return true;
  // Columns separated by tabs or runs of spaces.
  if (lines.filter((l) => /\t| {3,}/.test(l)).length >= 3) return true;
  // Rows of numbers.
  return lines.filter((l) => (l.match(/\d+([.,]\d+)?/g) ?? []).length >= 3).length >= 3;
}

function looksLikeMath(text: string, lines: string[]): boolean {
  const symbols = (text.match(MATH_SYMBOLS) ?? []).length;
  if (symbols >= 2 || LATEX_TOKENS.test(text)) return true;
  const equations = lines.filter((l) => /[A-Za-z]\w*\s*=\s*\S/.test(l) && /[+\-*/^()]/.test(l)).length;
  return equations >= 2 || /\w\^\w|\w_\{?\w/.test(text);
}

function looksLikeDiagram(lines: string[]): boolean {
  if (lines.length < MIN_LINES_FOR_DIAGRAM) return false;
  const short = lines.filter((l) => l.split(/\s+/).length <= SHORT_LINE_MAX_WORDS).length;
  const avg = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  return short / lines.length >= DIAGRAM_SHORT_RATIO && avg <= DIAGRAM_MAX_AVG_CHARS;
}

function looksGarbled(text: string): boolean {
  if ((text.match(REPLACEMENT_CHARS) ?? []).length >= 3) return true;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 20) return false;
  const single = tokens.filter((t) => t.length === 1 && !/^[aAiIoOvVeE0-9.,;:()\-–•*]$/.test(t)).length;
  return single / tokens.length > 0.3;
}

// Reading a page with the vision model is slow (and uses model quota), and slide decks trip the table/diagram
// checks on almost every page. So by default only pages whose text layer is broken ("garbled") are read
// automatically (pages without any text are always read); tables, formulas and diagrams are read on demand
// with "Görselle aktar". AI_AUTO_TRANSCRIBE=on restores the automatic table/math/diagram checks.
export function autoTranscribeEnabled(): boolean {
  return (process.env.AI_AUTO_TRANSCRIBE ?? "").trim().toLowerCase() === "on";
}

export function needsAutoTranscribe(need: TranscribeNeed): boolean {
  return autoTranscribeEnabled() ? need.needed : need.reasons.includes("garbled");
}

// Cheap, conservative text-based checks; false positives only cost one extra vision call.
export function detectTranscribeNeed(text: string): TranscribeNeed {
  const lines = lineList(text);
  const reasons: TranscribeReason[] = [];
  if (looksLikeTable(text, lines)) reasons.push("table");
  if (looksLikeMath(text, lines)) reasons.push("math");
  if (looksLikeDiagram(lines)) reasons.push("diagram");
  if (looksGarbled(text)) reasons.push("garbled");
  return { needed: reasons.length > 0, reasons };
}

// Words of a text, lowercased, used to compare original and transcribed text.
function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\p{L}{4,}/gu) ?? []);
}

// Guards against a model that summarized, commented or hallucinated instead of transcribing.
// Returns the transcription when it is plausible, otherwise null (caller keeps the original text).
export function validateTranscription(original: string, transcribed: string | undefined): string | null {
  const text = transcribed?.trim();
  if (!text) return null;
  if (/<<<PAGE|^\s*(tabii|elbette|işte|here is|sure)\b/i.test(text)) return null;

  const originalWords = wordSet(original);
  // A faithful transcription keeps most of the words the text layer already had.
  if (originalWords.size >= 8) {
    const kept = [...originalWords].filter((w) => text.toLowerCase().includes(w)).length;
    if (kept / originalWords.size < 0.5) return null;
  }
  // Wildly longer output than the page could hold means the model added content.
  if (original.length >= 200 && text.length > original.length * 6) return null;
  return text;
}
