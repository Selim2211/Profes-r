import { describe, expect, it } from "vitest";
import { parseClaims } from "@/lib/summary/claims";
import {
  VERIFY_BATCH_SIZE,
  pageOfQuote,
  quoteInChunk,
  resolveVerdicts,
  verifySummary,
  type Evidence,
  type PageRef,
  type RawJudgement,
  type VerifyDeps,
} from "@/lib/summary/verify";

const chunk = (id: string, overrides: Partial<Evidence> = {}): Evidence => ({
  id,
  document_id: "d1",
  week_number: 1,
  page_start: 4,
  page_end: 6,
  heading: null,
  content: "Anthony's Triangle categorizes information systems into strategic, tactical and operational levels.",
  ...overrides,
});

const pages: PageRef[] = [
  { documentId: "d1", page: 4, text: "Intro page about systems." },
  { documentId: "d1", page: 5, text: "Anthony's Triangle categorizes information systems into strategic, tactical and operational levels." },
  { documentId: "d2", page: 5, text: "Anthony's Triangle categorizes information systems into strategic, tactical and operational levels." },
];

const claimsOf = (md: string) => parseClaims(md);

describe("quote validation", () => {
  it("accepts quotes that occur in the chunk (ignoring case/punctuation) and rejects invented ones", () => {
    const c = chunk("c1");
    expect(quoteInChunk("anthony's triangle categorizes information systems", c)).toBe(true);
    expect(quoteInChunk("The triangle has seven layers of management", c)).toBe(false);
    expect(quoteInChunk("short", c)).toBe(false);
  });

  it("finds the page of a quote inside the chunk's own document and page range", () => {
    const c = chunk("c1");
    expect(pageOfQuote("Anthony's Triangle categorizes information systems", c, pages)).toBe(5);
    expect(pageOfQuote("not on any page at all really", c, pages)).toBeNull();
    // Same text exists on another document's page 5; only the chunk's document counts.
    expect(pageOfQuote("Anthony's Triangle categorizes", chunk("c2", { document_id: "d3" }), pages)).toBeNull();
  });
});

describe("resolveVerdicts", () => {
  const md = "Anthony Üçgeni sistemleri üç düzeye ayırır.\n\nİkinci iddia için kanıt yoktur burada.\n";
  const claims = claimsOf(md);
  const evidence = [[chunk("c1")], [chunk("c2")]];
  const good: RawJudgement = {
    id: 0, verdict: "supported", evidence: 1,
    quote: "Anthony's Triangle categorizes information systems", rewrite: "",
  };

  it("accepts a supported claim with a real quote and tags it with the quote's page", () => {
    const [v] = resolveVerdicts(claims, evidence, [good], pages);
    expect(v).toEqual({ claimId: 0, status: "supported", tag: "[H1 · s.5]" });
  });

  it("removes a 'supported' claim whose quote is invented", () => {
    const [v] = resolveVerdicts(claims, evidence, [{ ...good, quote: "completely made up quotation from nowhere" }], pages);
    expect(v).toMatchObject({ status: "removed" });
  });

  it("removes claims the judge did not answer or marked unsupported", () => {
    const verdicts = resolveVerdicts(claims, evidence, [{ id: 1, verdict: "unsupported", evidence: 0, quote: "", rewrite: "" }], pages);
    expect(verdicts.map((v) => v.status)).toEqual(["removed", "removed"]);
  });

  it("rewrites partly supported claims and falls back to the chunk's page range if the page is unknown", () => {
    const partial: RawJudgement = { ...good, verdict: "partial", rewrite: "Anthony Üçgeni sistemleri düzeylere ayırır." };
    const [v] = resolveVerdicts(claims, evidence, [partial], []);
    expect(v).toEqual({ claimId: 0, status: "rewritten", tag: "[H1 · s.4-6]", rewrite: "Anthony Üçgeni sistemleri düzeylere ayırır." });
  });

  it("removes a partial claim whose rewrite is empty", () => {
    const [v] = resolveVerdicts(claims, evidence, [{ ...good, verdict: "partial", rewrite: "" }], pages);
    expect(v).toMatchObject({ status: "removed" });
  });

  it("removes a claim that cites a non-existent evidence number", () => {
    const [v] = resolveVerdicts(claims, evidence, [{ ...good, evidence: 9 }], pages);
    expect(v).toMatchObject({ status: "removed" });
  });
});

describe("verifySummary", () => {
  const md = [
    "## 1. Genel bakış",
    "",
    "Birinci doğru iddia burada yazılıdır.",
    "",
    "Yanlış ve kanıtsız bir iddia burada geçer.",
    "",
    "- Kısmen doğru madde metni burada [H9 · s.1].",
    "",
  ].join("\n");

  function deps(): { deps: VerifyDeps; batches: number[] } {
    const batches: number[] = [];
    return {
      batches,
      deps: {
        async findEvidence(claims) {
          return claims.map(() => [chunk("c1")]);
        },
        async judge(claims) {
          batches.push(claims.length);
          const quote = "Anthony's Triangle categorizes information systems";
          return claims.map((c): RawJudgement => {
            if (c.text.includes("doğru iddia")) return { id: c.id, verdict: "supported", evidence: 1, quote, rewrite: "" };
            if (c.text.includes("Kısmen")) return { id: c.id, verdict: "partial", evidence: 1, quote, rewrite: "Düzeltilmiş madde metni burada." };
            return { id: c.id, verdict: "unsupported", evidence: 0, quote: "", rewrite: "" };
          });
        },
      },
    };
  }

  it("tags supported claims, rewrites partial ones, removes unsupported ones and reports", async () => {
    const { deps: d } = deps();
    const { contentMd, report } = await verifySummary({ summaryMd: md, deps: d, pages });

    expect(contentMd).toContain("Birinci doğru iddia burada yazılıdır [H1 · s.5].");
    expect(contentMd).not.toContain("kanıtsız");
    expect(contentMd).toContain("- Düzeltilmiş madde metni burada [H1 · s.5].");
    expect(contentMd).not.toContain("[H9 · s.1]");
    expect(contentMd).toContain("## 1. Genel bakış");

    expect(report).toMatchObject({ claims: 3, supported: 1, rewritten: 1, removed: 1, finalUnsupported: 0 });
    expect(report.initialUnsupportedRatio).toBeCloseTo(2 / 3);
    expect(report.changes.map((c) => c.status).sort()).toEqual(["removed", "rewritten"]);
  });

  it("judges claims in batches", async () => {
    const many = Array.from({ length: VERIFY_BATCH_SIZE + 3 }, (_, i) => `- Madde ${i} için uzun bir iddia metni yazıldı.`).join("\n");
    const { deps: d, batches } = deps();
    await verifySummary({ summaryMd: many, deps: d, pages });
    expect(batches).toEqual([VERIFY_BATCH_SIZE, 3]);
  });

  it("handles a summary without claims", async () => {
    const { deps: d } = deps();
    const { report } = await verifySummary({ summaryMd: "## 1. Genel bakış\n", deps: d, pages });
    expect(report).toMatchObject({ claims: 0, initialUnsupportedRatio: 0 });
  });
});
