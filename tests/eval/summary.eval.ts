import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeForMatch } from "@/lib/summary/coverage";
import { evalClient, findDocument, report } from "./helpers";

const TARGET_COVERAGE = 0.95;
const TARGET_UNSUPPORTED = 0.03;

type ExpectedTopic = { name: string; any: string[] };
type Entry = { title: string; level: "short" | "standard" | "detailed"; expectedTopics: ExpectedTopic[] };
const entries = JSON.parse(readFileSync("tests/eval/docs.json", "utf8")) as Entry[];

describe.each(entries)("özet değerlendirmesi: $title ($level)", (entry) => {
  async function loadSummary() {
    const supabase = evalClient();
    const docs = await findDocument(supabase, entry.title);

    for (const doc of docs) {
      const { data } = await supabase
        .from("summaries")
        .select("id, content_md, version")
        .eq("scope", "document")
        .eq("document_id", doc.id)
        .eq("level", entry.level)
        .eq("status", "ready")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return { supabase, doc, summary: data };
    }
    return null;
  }

  it(`olması gereken konuların kapsanma oranı ≥ %${TARGET_COVERAGE * 100}`, async () => {
    const found = await loadSummary();
    expect(found, `"${entry.title}" için hazır ${entry.level} özet yok; önce uygulamadan özet üret`).not.toBeNull();

    const text = normalizeForMatch(found!.summary.content_md);
    const missing = entry.expectedTopics.filter((t) => !t.any.some((a) => text.includes(normalizeForMatch(a))));
    const coverage = 1 - missing.length / entry.expectedTopics.length;

    report(`KAPSAM [${entry.title} · ${entry.level} · v${found!.summary.version}]: %${(coverage * 100).toFixed(1)} (${entry.expectedTopics.length - missing.length}/${entry.expectedTopics.length}), hedef ≥ %${TARGET_COVERAGE * 100}`);
    if (missing.length) report(`  Eksik konular: ${missing.map((t) => t.name).join(" | ")}`);
    expect(coverage).toBeGreaterThanOrEqual(TARGET_COVERAGE);
  }, 120_000);

  it(`desteklenmeyen iddia oranı ≤ %${TARGET_UNSUPPORTED * 100} (özet baştan doğrulanır)`, async () => {
    const found = await loadSummary();
    expect(found).not.toBeNull();
    const { supabase, doc, summary } = found!;

    const { loadScopePages } = await import("@/lib/summary/store");
    const { createModelDeps, verifySummary } = await import("@/lib/summary/verify");
    const scope = { scope: "document" as const, courseId: doc.course_id, documentId: doc.id };

    const { report: result } = await verifySummary({
      summaryMd: summary.content_md,
      deps: createModelDeps(supabase, scope, doc.week_number),
      pages: await loadScopePages(supabase, scope),
    });
    const unsupported = (result.rewritten + result.removed) / Math.max(result.claims, 1);

    report(
      `DOĞRULAMA [${entry.title} · ${entry.level}]: ${result.claims} iddia, ${result.supported} destekli, ${result.rewritten} düzeltilecek, ${result.removed} kaldırılacak → desteklenmeyen oran %${(unsupported * 100).toFixed(1)}, hedef ≤ %${TARGET_UNSUPPORTED * 100}`,
    );
    for (const c of result.changes) report(`  [${c.status}] ${c.before.slice(0, 120)}${c.after ? " → " + c.after.slice(0, 120) : ""}`);
    expect(unsupported).toBeLessThanOrEqual(TARGET_UNSUPPORTED);
  }, 600_000);
});
