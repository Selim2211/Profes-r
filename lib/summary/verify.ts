import type { SupabaseClient } from "@supabase/supabase-js";
import { generateObject } from "ai";
import { judgeModel } from "@/lib/ai/models";
import { CLAIM_JUDGE_PROMPT } from "@/lib/ai/prompts";
import { claimJudgeSchema } from "@/lib/ai/schemas";
import { embedTexts } from "@/lib/ingest/embed";
import { citationLabel, type NoteHit } from "@/lib/rag/search";
import { withRetry } from "@/lib/utils/retry";
import { applyVerdicts, parseClaims, plainText, rewriteKeepsShape, type Claim, type Verdict } from "./claims";
import { normalizeForMatch } from "./coverage";
import { lexicalSupport } from "./lexical";
import type { SummaryScope } from "./store";

// Claims of one section share evidence chunks, and the judge sees each distinct chunk once per call, so a
// bigger batch sends fewer tokens per claim (and makes fewer calls).
export const VERIFY_BATCH_SIZE = 12;
// Evidence is what costs tokens (every chunk is shown to the judge), so each claim gets its best two; the
// judge may still cite any chunk the batch brought in for other claims.
const EVIDENCE_PER_CLAIM = 2;
const SEARCH_CANDIDATES = 12;
// Chunks are about 3200 characters; clipping them hides the part that supports a claim.
const EVIDENCE_CHARS = 4000;
const SEARCH_CONCURRENCY = 4;

export type Evidence = Pick<NoteHit, "id" | "document_id" | "week_number" | "page_start" | "page_end" | "heading" | "content">;

// Text of one stored page; used to find the exact page a quote comes from.
export type PageRef = { documentId: string; page: number; text: string };

export type RawJudgement = {
  id: number;
  verdict: "supported" | "partial" | "unsupported";
  evidence: number;
  quote: string;
  rewrite: string;
};

export type VerifyDeps = {
  // Evidence chunks for each claim (same order as the claims).
  findEvidence(claims: Claim[]): Promise<Evidence[][]>;
  judge(claims: Claim[], evidence: Evidence[][]): Promise<RawJudgement[]>;
};

export type VerificationReport = {
  claims: number;
  supported: number;
  // How many of the supported claims were confirmed by word overlap alone (no model call).
  autoVerified: number;
  rewritten: number;
  removed: number;
  // Share of claims that were not fully supported before the corrections (rewritten + removed).
  initialUnsupportedRatio: number;
  // Claims in the final summary that are still unverified: always 0, unsupported ones are removed.
  finalUnsupported: number;
  changes: { status: "rewritten" | "removed"; before: string; after?: string; reason?: string }[];
};

const clip = (text: string, length = EVIDENCE_CHARS) => (text.length > length ? `${text.slice(0, length)}…` : text);

const MIN_QUOTE_CHARS = 12;
// After normalization (symbols and spaces removed) "$v = y^{1-n}$" is just "vy1n".
const MIN_FORMULA_QUOTE_CHARS = 4;
const MIN_FUZZY_WORDS = 5;
const FUZZY_WORD_RATIO = 0.85;

const wordsOf = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).map(normalizeForMatch).filter(Boolean);

// Does the quote really appear in the evidence chunk? (Models invent quotes when they guess.)
// A verbatim match (ignoring case, punctuation and markdown) always counts. Models also copy
// table cells or list items with slightly different markup, so a quote whose words are almost all in
// the chunk counts too; an invented sentence shares far fewer words and still fails.
export function quoteInChunk(quote: string, chunk: Pick<Evidence, "content">): boolean {
  const needle = normalizeForMatch(quote);
  // A formula such as "$v = y^{1-n}$" is legitimately short; ordinary text needs a longer quote.
  const minChars = /[$\\=^_]/.test(quote) ? MIN_FORMULA_QUOTE_CHARS : MIN_QUOTE_CHARS;
  if (needle.length < minChars) return false;
  if (normalizeForMatch(chunk.content).includes(needle)) return true;

  const words = wordsOf(quote);
  if (words.length < MIN_FUZZY_WORDS) return false;
  const available = new Set(wordsOf(chunk.content));
  return words.filter((w) => available.has(w)).length / words.length >= FUZZY_WORD_RATIO;
}

// The page of the chunk's document on which the quote occurs, if it can be found.
export function pageOfQuote(quote: string, chunk: Evidence, pages: PageRef[]): number | null {
  const needle = normalizeForMatch(quote);
  if (needle.length < 12) return null;
  const match = pages.find(
    (p) =>
      p.documentId === chunk.document_id &&
      p.page >= chunk.page_start &&
      p.page <= chunk.page_end &&
      normalizeForMatch(p.text).includes(needle),
  );
  return match?.page ?? null;
}

function tagFor(chunk: Evidence, page: number | null): string {
  return citationLabel({
    week_number: chunk.week_number,
    page_start: page ?? chunk.page_start,
    page_end: page ?? chunk.page_end,
  });
}

// The distinct evidence chunks of a batch, numbered from 1 in order of first appearance. Claims of
// one section often share chunks, so each chunk is shown to the judge only once.
export function buildPool(evidence: Evidence[][]): Evidence[] {
  const pool = new Map<string, Evidence>();
  for (const chunks of evidence) for (const chunk of chunks) if (!pool.has(chunk.id)) pool.set(chunk.id, chunk);
  return [...pool.values()];
}

// Turns the judge's raw answers into verdicts, trusting nothing that cannot be checked:
// a "supported" needs evidence and a quote that really occurs in it, otherwise the claim is removed.
// `evidence` numbers in the judge's answers refer to buildPool(evidence).
export function resolveVerdicts(
  claims: Claim[],
  evidence: Evidence[][],
  raw: RawJudgement[],
  pages: PageRef[],
): Verdict[] {
  const byId = new Map(raw.map((r) => [r.id, r]));
  const pool = buildPool(evidence);

  return claims.map((claim): Verdict => {
    const judgement = byId.get(claim.id);
    const chunk = judgement && judgement.evidence >= 1 ? pool[judgement.evidence - 1] : undefined;

    if (!judgement || judgement.verdict === "unsupported") {
      return { claimId: claim.id, status: "removed", reason: judgement ? "Kanıt bulunamadı." : "Hakem karar vermedi." };
    }
    if (!chunk || !quoteInChunk(judgement.quote, chunk)) {
      return { claimId: claim.id, status: "removed", reason: "Alıntı kanıtta doğrulanamadı." };
    }

    const tag = tagFor(chunk, pageOfQuote(judgement.quote, chunk, pages));
    if (judgement.verdict === "supported") return { claimId: claim.id, status: "supported", tag };

    if (!rewriteKeepsShape(claim.text, judgement.rewrite, claim.kind)) {
      return { claimId: claim.id, status: "removed", reason: "Düzeltme biçimi uygun değil." };
    }
    return { claimId: claim.id, status: "rewritten", tag, rewrite: judgement.rewrite.trim() };
  });
}

export function buildReport(claims: Claim[], verdicts: Verdict[]): VerificationReport {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const changes: VerificationReport["changes"] = [];
  let supported = 0;
  let autoVerified = 0;
  let rewritten = 0;
  let removed = 0;

  for (const v of verdicts) {
    const before = plainText(byId.get(v.claimId)?.text ?? "");
    if (v.status === "supported") {
      supported++;
      if (v.auto) autoVerified++;
    } else if (v.status === "rewritten") {
      rewritten++;
      changes.push({ status: "rewritten", before, after: plainText(v.rewrite) });
    } else {
      removed++;
      changes.push({ status: "removed", before, reason: v.reason });
    }
  }
  return {
    claims: claims.length,
    supported,
    autoVerified,
    rewritten,
    removed,
    initialUnsupportedRatio: claims.length ? (rewritten + removed) / claims.length : 0,
    finalUnsupported: 0,
    changes,
  };
}

// Verifies one batch of claims; used directly by the step-by-step job. Claims that a note already
// backs word for word are confirmed without a model call; only the rest go to the judge.
export async function verifyBatch(claims: Claim[], deps: VerifyDeps, pages: PageRef[]): Promise<Verdict[]> {
  const evidence = await deps.findEvidence(claims);

  const auto = new Map<number, Verdict>();
  claims.forEach((claim, i) => {
    const hit = lexicalSupport(claim.text, evidence[i] ?? []);
    if (!hit) return;
    const chunk = evidence[i][hit.chunkIndex];
    auto.set(claim.id, { claimId: claim.id, status: "supported", tag: tagFor(chunk, pageOfQuote(hit.quote, chunk, pages)), auto: true });
  });

  const pending = claims.map((claim, i) => ({ claim, evidence: evidence[i] ?? [] })).filter((p) => !auto.has(p.claim.id));
  const judged =
    pending.length > 0
      ? resolveVerdicts(
          pending.map((p) => p.claim),
          pending.map((p) => p.evidence),
          await deps.judge(pending.map((p) => p.claim), pending.map((p) => p.evidence)),
          pages,
        )
      : [];
  const byId = new Map(judged.map((v) => [v.claimId, v]));

  return claims.map((claim) => auto.get(claim.id) ?? byId.get(claim.id)!);
}

// Splits the summary into claims, checks each against the notes, and returns the corrected summary
// (verified tags added, partly supported claims rewritten, unsupported ones removed) with a report.
export async function verifySummary(args: {
  summaryMd: string;
  deps: VerifyDeps;
  pages: PageRef[];
}): Promise<{ contentMd: string; report: VerificationReport }> {
  const claims = parseClaims(args.summaryMd);
  const verdicts: Verdict[] = [];
  for (let i = 0; i < claims.length; i += VERIFY_BATCH_SIZE) {
    verdicts.push(...(await verifyBatch(claims.slice(i, i + VERIFY_BATCH_SIZE), args.deps, args.pages)));
  }
  return { contentMd: applyVerdicts(args.summaryMd, claims, verdicts), report: buildReport(claims, verdicts) };
}

// --- Supabase / model implementation -------------------------------------------------------

async function inGroups<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  }
  return results;
}

// Hybrid search (match_chunks) for every claim, limited to the summary's documents.
export function createEvidenceFinder(supabase: SupabaseClient, scope: SummaryScope, weekNumber: number | null) {
  return async (claims: Claim[]): Promise<Evidence[][]> => {
    const queries = claims.map((c) => plainText(c.text));
    const embeddings = await embedTexts(queries);

    return inGroups(claims.map((_, i) => i), SEARCH_CONCURRENCY, async (i) => {
      const { data, error } = await supabase.rpc("match_chunks", {
        query_embedding: JSON.stringify(embeddings[i]),
        query_text: queries[i],
        p_course_id: scope.courseId,
        p_weeks: scope.scope === "week" ? [scope.weekNumber] : weekNumber !== null ? [weekNumber] : null,
        match_count: SEARCH_CANDIDATES,
      });
      if (error) throw new Error(error.message);

      const hits = (data ?? []) as Evidence[];
      const inScope = scope.scope === "document" ? hits.filter((h) => h.document_id === scope.documentId) : hits;
      return inScope.slice(0, EVIDENCE_PER_CLAIM);
    });
  };
}

// The text the judge model receives for one batch (also used to measure how many tokens a batch costs).
export function buildJudgePrompt(claims: Claim[], evidence: Evidence[][]): string {
  const pool = buildPool(evidence);
  const numberOf = new Map(pool.map((chunk, n) => [chunk.id, n + 1]));

  const evidenceText = pool
    .map((e, n) => `[${n + 1}] ${citationLabel(e)}${e.heading ? ` (${e.heading})` : ""}\n${clip(e.content)}`)
    .join("\n\n");

  const claimText = claims
    .map((claim, i) => {
      const candidates = (evidence[i] ?? []).map((e) => `[${numberOf.get(e.id)}]`).join(" ");
      const context = claim.context ? `\nBağlam: ${claim.context}` : "";
      return `İddia ${claim.id}: ${plainText(claim.text)}${context}\nEn yakın kanıtlar: ${candidates || "(yok)"}`;
    })
    .join("\n\n");

  return `<kanitlar>\n${evidenceText}\n</kanitlar>\n\n<iddialar>\n${claimText}\n</iddialar>`;
}

export const modelJudge: VerifyDeps["judge"] = async (claims, evidence) => {
  const prompt = buildJudgePrompt(claims, evidence);
  const { object } = await withRetry(() =>
    generateObject({
      model: judgeModel(),
      schema: claimJudgeSchema,
      system: CLAIM_JUDGE_PROMPT,
      temperature: 0,
      prompt,
    }),
  );
  return object.results;
};

export function createModelDeps(supabase: SupabaseClient, scope: SummaryScope, weekNumber: number | null): VerifyDeps {
  return { findEvidence: createEvidenceFinder(supabase, scope, weekNumber), judge: modelJudge };
}
