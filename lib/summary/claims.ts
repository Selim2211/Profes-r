import { CITATION_PATTERN } from "@/lib/rag/citations";

// A single checkable statement of the summary, with its exact position in the markdown.
export type Claim = {
  id: number;
  line: number;
  // Offsets of the claim text inside its line.
  start: number;
  end: number;
  kind: "sentence" | "item" | "row" | "answer";
  text: string;
  // What the statement belongs to (the lead-in line before a list or table, else the heading), so
  // fragments such as "Rekabet avantajı," can be judged in context.
  context: string;
};

export type Verdict =
  // `auto`: confirmed by word overlap with a note, without asking a model (see lexical.ts).
  | { claimId: number; status: "supported"; tag: string; auto?: boolean }
  | { claimId: number; status: "rewritten"; tag: string; rewrite: string }
  | { claimId: number; status: "removed"; reason: string };

const TAG = "\\[(?:H\\d+|Not) · s\\.\\d+(?:-\\d+)?\\]";
const TAG_RUN = new RegExp(`(?:\\s*${TAG})+`, "g");
const SENTENCE_END = new RegExp(`[.!?](?:\\s*${TAG})*(?=\\s+[A-ZÇĞİÖŞÜ"*(\\d]|\\s*$)`, "g");
const LIST_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
const ANSWER_LINE = /^(\s*\[\[CEVAP:\s*)([\s\S]*?)(\s*\]\]\s*)$/;
const PLACEHOLDER = /^\s*notlarda\b.*\byok\.?\s*$/i;
const MIN_CLAIM_CHARS = 12;

export function stripTags(text: string): string {
  return text.replace(TAG_RUN, "").replace(/\s+([.,;:!?])/g, "$1").trim();
}

export function tagsIn(text: string): string[] {
  return [...text.matchAll(CITATION_PATTERN)].map((m) => m[0]);
}

// Plain text of a claim for retrieval and judging: no tags, no markdown emphasis or table pipes.
export function plainText(text: string): string {
  return stripTags(text)
    .replace(/\*\*|__|`/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes("-");
}

// Table rows after the header row. The header (the row right before a separator) is not a claim.
function isTableHeader(lines: string[], i: number): boolean {
  return isTableLine(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]);
}

function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let from = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    spans.push({ start: from, end });
    from = end;
  }
  if (from < text.length) spans.push({ start: from, end: text.length });
  return spans
    .map(({ start, end }) => {
      const raw = text.slice(start, end);
      const lead = raw.length - raw.trimStart().length;
      return { start: start + lead, end: start + lead + raw.trim().length };
    })
    .filter((s) => s.end > s.start);
}

const isClaimText = (text: string) => plainText(text).length >= MIN_CLAIM_CHARS && !PLACEHOLDER.test(text) && !/:\s*$/.test(plainText(text));

// Splits a summary into checkable statements. Headings, table headers, placeholders ("Notlarda ... yok."),
// lead-in lines ending with a colon and quiz questions are skipped; quiz answers are claims.
export function parseClaims(markdown: string): Claim[] {
  const lines = markdown.split("\n");
  const claims: Claim[] = [];
  let heading = "";
  let leadIn = "";
  const add = (claim: Omit<Claim, "id" | "context">, withLeadIn: boolean) =>
    claims.push({ ...claim, id: claims.length, context: (withLeadIn && leadIn) || heading });

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || /^```/.test(trimmed)) return;
    if (/^#{1,6}\s/.test(trimmed)) {
      heading = plainText(trimmed.replace(/^#{1,6}\s+/, ""));
      leadIn = "";
      return;
    }

    const answer = line.match(ANSWER_LINE);
    if (answer) {
      const start = answer[1].length;
      if (isClaimText(answer[2])) add({ line: i, start, end: start + answer[2].length, kind: "answer", text: answer[2] }, false);
      return;
    }
    if (isTableLine(line)) {
      if (isTableSeparator(line) || isTableHeader(lines, i)) return;
      if (isClaimText(line)) add({ line: i, start: 0, end: line.length, kind: "row", text: line }, true);
      return;
    }

    const prefix = line.match(LIST_PREFIX)?.[1] ?? "";
    const body = line.slice(prefix.length);
    // A numbered line ending in "?" is a quiz question, not a statement.
    if (/\?\s*$/.test(plainText(body))) return;

    if (prefix) {
      if (isClaimText(body)) add({ line: i, start: prefix.length, end: line.length, kind: "item", text: body }, true);
      return;
    }
    // A line ending with a colon introduces a list or table that follows.
    if (/:\s*$/.test(plainText(body))) leadIn = plainText(body);
    for (const span of sentenceSpans(body)) {
      const text = body.slice(span.start, span.end);
      if (isClaimText(text)) add({ line: i, start: span.start, end: span.end, kind: "sentence", text }, false);
    }
  });
  return claims;
}

// Re-attaches a verified source tag: existing tags are dropped, the new one goes at the end of the
// statement (inside the last cell for table rows), before closing punctuation.
export function withTag(text: string, tag: string, kind: Claim["kind"]): string {
  const core = stripTags(text);
  if (kind === "row") {
    const last = core.lastIndexOf("|");
    const inner = core.slice(0, last).trimEnd();
    return `${inner} ${tag} |`;
  }
  // A dangling comma/semicolon before the tag reads as a glitch ("... kapsar, [H1 · s.4].").
  const trimmed = core.replace(/\s*[,;]+([.!?:]?)$/, "$1");
  const punct = trimmed.match(/[.!?:]$/)?.[0] ?? (kind === "sentence" && trimmed !== core ? "." : "");
  const body = /[.!?:]$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
  return `${body.trimEnd()} ${tag}${punct}`;
}

const pipeCount = (text: string) => (text.match(/\|/g) ?? []).length;

// Unescaped dollar signs always come in pairs in valid inline/display math.
export function mathDelimitersBalanced(text: string): boolean {
  return ((text.replace(/\\\$/g, "").match(/\$/g) ?? []).length % 2) === 0;
}

// Whether a rewrite keeps the shape of the original (table rows must keep their cells) and does not
// break LaTeX delimiters.
export function rewriteKeepsShape(original: string, rewrite: string, kind: Claim["kind"]): boolean {
  if (!rewrite.trim() || !mathDelimitersBalanced(rewrite)) return false;
  if (kind === "row") return pipeCount(rewrite) === pipeCount(original);
  return !rewrite.includes("\n");
}

// Applies verdicts: verified tags are written, partly supported statements are replaced by their
// corrected version and unsupported ones are removed (a removed quiz answer takes its question along).
export function applyVerdicts(markdown: string, claims: Claim[], verdicts: Verdict[]): string {
  const byId = new Map(verdicts.map((v) => [v.claimId, v]));
  let lines = markdown.split("\n");
  const deleteLines = new Set<number>();

  // Right to left, so earlier offsets in the same line stay valid.
  const ordered = [...claims].sort((a, b) => b.line - a.line || b.start - a.start);

  for (const claim of ordered) {
    const verdict = byId.get(claim.id);
    if (!verdict) continue;
    const line = lines[claim.line];

    if (verdict.status === "removed") {
      const remaining = (line.slice(0, claim.start) + line.slice(claim.end)).replace(LIST_PREFIX, "").replace(/\[\[CEVAP:\s*\]\]/, "");
      if (claim.kind === "sentence" && plainText(remaining).length > 0) {
        lines[claim.line] = `${line.slice(0, claim.start)}${line.slice(claim.end)}`.replace(/\s{2,}/g, " ").trimEnd();
        continue;
      }
      deleteLines.add(claim.line);
      if (claim.kind === "answer") {
        // The question is the nearest earlier non-empty line.
        for (let j = claim.line - 1; j >= 0; j--) {
          if (lines[j].trim()) {
            deleteLines.add(j);
            break;
          }
        }
      }
      continue;
    }

    const replacement = withTag(verdict.status === "rewritten" ? verdict.rewrite : claim.text, verdict.tag, claim.kind);
    lines[claim.line] = line.slice(0, claim.start) + replacement + line.slice(claim.end);
  }

  lines = lines.filter((_, i) => !deleteLines.has(i));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
