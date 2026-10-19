import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanPages, type PageText } from "@/lib/ingest/clean";
import { isPdfPath } from "@/lib/ingest/extract";
import { transcribePages } from "@/lib/ingest/ocr";
import { runIngestStep } from "@/lib/ingest/pipeline";
import { validateTranscription } from "@/lib/ingest/transcribe";
import { applyVerdicts, parseClaims } from "./claims";
import { ensureCoverage } from "./coverage";
import { stepProgress, type JobCursor, type SummaryJob, type SummaryJobView, type SummaryStep } from "./jobs";
import { createSectionMapper, mapSections } from "./map";
import { planDocumentSections, replanSections } from "./outline";
import { reduceToSummary } from "./reduce";
import {
  loadScopeEntries,
  loadScopePages,
  loadTopics,
  saveSummary,
  updateSummary,
  type SummaryScope,
} from "./store";
import { createSectionStore } from "./store";
import { fillEmptySections, type SummaryLevel } from "./template";
import { VERIFY_BATCH_SIZE, buildReport, createModelDeps, verifyBatch } from "./verify";

const MAP_CALLS_PER_REQUEST = 2;
const TRANSCRIBE_PAGES_PER_REQUEST = 5;

class UserFacingError extends Error {}

function fail(message: string): never {
  throw new UserFacingError(message);
}

type ScopeDoc = { id: string; title: string; week_number: number | null; status: string; storage_path: string };

function scopeOf(job: SummaryJob): SummaryScope {
  return job.scope === "document"
    ? { scope: "document", courseId: job.course_id, documentId: job.document_id! }
    : { scope: "week", courseId: job.course_id, weekNumber: job.week_number! };
}

async function setJob(supabase: SupabaseClient, job: SummaryJob, patch: Partial<SummaryJob>) {
  Object.assign(job, patch);
  const { error } = await supabase
    .from("summary_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
}

async function advance(supabase: SupabaseClient, job: SummaryJob, step: Exclude<SummaryStep, "failed">, cursor: JobCursor = {}) {
  await setJob(supabase, job, { step, progress: stepProgress(step, 0), cursor });
}

async function scopeDocuments(supabase: SupabaseClient, job: SummaryJob): Promise<ScopeDoc[]> {
  let query = supabase
    .from("documents")
    .select("id, title, week_number, status, storage_path")
    .eq("course_id", job.course_id);
  query = job.scope === "document" ? query.eq("id", job.document_id!) : query.eq("week_number", job.week_number!).eq("status", "ready");

  const { data, error } = await query.order("created_at");
  if (error) throw new Error(error.message);
  const docs = (data ?? []) as ScopeDoc[];
  if (docs.length === 0) fail("Bu kapsamda işlenmiş doküman bulunamadı.");
  if (docs.some((d) => d.status !== "ready")) fail("Bazı dokümanların işlenmesi henüz bitmedi.");
  return docs;
}

async function documentPages(supabase: SupabaseClient, documentId: string): Promise<PageText[]> {
  const { data, error } = await supabase
    .from("document_pages")
    .select("page_number, text")
    .eq("document_id", documentId)
    .order("page_number");
  if (error) throw new Error(error.message);
  // The same header/footer cleaning as for chunks, so sections and chunks see the same text.
  return cleanPages((data ?? []).map((p) => ({ page: p.page_number as number, text: p.text as string })));
}

async function courseName(supabase: SupabaseClient, courseId: string): Promise<string> {
  const { data } = await supabase.from("courses").select("name").eq("id", courseId).maybeSingle();
  return data?.name ?? "";
}

async function currentSummary(supabase: SupabaseClient, job: SummaryJob): Promise<string> {
  if (!job.summary_id) fail("Özet taslağı bulunamadı.");
  const { data, error } = await supabase.from("summaries").select("content_md").eq("id", job.summary_id).single();
  if (error || !data) throw new Error(error?.message ?? "Özet taslağı bulunamadı.");
  return data.content_md as string;
}

// transcribe: make sure the stored page texts are the faithful ones. Pages whose image transcription
// failed at upload are retried once; documents that changed are chunked and embedded again.
async function stepTranscribe(supabase: SupabaseClient, job: SummaryJob) {
  const docs = await scopeDocuments(supabase, job);
  const cursor = job.cursor;

  // Re-chunking documents whose pages changed (one ingestion slice per request).
  if (cursor.ingestJobs?.length) {
    const [pending, ...rest] = cursor.ingestJobs;
    const view = await runIngestStep(supabase, pending.jobId);
    if (view.stage === "failed") fail(`Doküman yeniden işlenemedi: ${view.error ?? "bilinmeyen hata"}`);
    await setJob(supabase, job, {
      cursor: { ...cursor, ingestJobs: view.stage === "done" ? rest : cursor.ingestJobs },
      progress: stepProgress("transcribe", 0.7),
    });
    return;
  }

  // Pages that failed once and have not been retried in this job.
  const { data: failed, error } = await supabase
    .from("document_pages")
    .select("document_id, page_number, text, reextract_reason")
    .in("document_id", docs.map((d) => d.id))
    .like("reextract_reason", "failed%")
    .not("reextract_reason", "like", "failed-again%")
    .order("document_id")
    .order("page_number")
    .limit(TRANSCRIBE_PAGES_PER_REQUEST);
  if (error) throw new Error(error.message);

  if (failed?.length) {
    const doc = docs.find((d) => d.id === failed[0].document_id)!;
    const batch = failed.filter((p) => p.document_id === doc.id);

    let transcribed = new Map<number, string>();
    let problem = "";
    if (isPdfPath(doc.storage_path)) {
      try {
        const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path);
        if (downloadError || !file) throw new Error("Dosya okunamadı.");
        transcribed = await transcribePages(new Uint8Array(await file.arrayBuffer()), batch.map((p) => p.page_number));
      } catch (e) {
        problem = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      }
    }

    let changed = false;
    for (const page of batch) {
      const accepted = validateTranscription(page.text, transcribed.get(page.page_number));
      const update = accepted
        ? { text: accepted, reextracted: true, reextract_reason: "retried" }
        : { reextract_reason: `failed-again(${problem || "rejected"})` };
      const { error: updateError } = await supabase
        .from("document_pages")
        .update(update)
        .eq("document_id", doc.id)
        .eq("page_number", page.page_number);
      if (updateError) throw new Error(updateError.message);
      changed ||= Boolean(accepted);
    }

    const changedDocuments = changed ? [...new Set([...(cursor.changedDocuments ?? []), doc.id])] : cursor.changedDocuments;
    await setJob(supabase, job, { cursor: { ...cursor, changedDocuments }, progress: stepProgress("transcribe", 0.4) });
    return;
  }

  // Nothing left to retry: queue re-chunking for the documents that changed.
  if (cursor.changedDocuments?.length) {
    const jobs: { documentId: string; jobId: string }[] = [];
    for (const documentId of cursor.changedDocuments) {
      const { data, error: insertError } = await supabase
        .from("ingestion_jobs")
        .insert({ document_id: documentId, stage: "chunk", next_page: 1 })
        .select("id")
        .single();
      if (insertError || !data) throw new Error(insertError?.message ?? "İş oluşturulamadı.");
      jobs.push({ documentId, jobId: data.id });
    }
    await setJob(supabase, job, { cursor: { ingestJobs: jobs }, progress: stepProgress("transcribe", 0.6) });
    return;
  }

  await advance(supabase, job, "section");
}

// section: split every document into sections. A model-made outline is stored so later steps reuse it.
async function stepSection(supabase: SupabaseClient, job: SummaryJob) {
  const docs = await scopeDocuments(supabase, job);
  const documents: NonNullable<JobCursor["documents"]> = [];

  for (const doc of docs) {
    const { sections, outline } = await planDocumentSections(await documentPages(supabase, doc.id));
    if (sections.length === 0) fail(`"${doc.title}" dokümanında okunabilir metin yok.`);
    documents.push({ documentId: doc.id, outline, sections: sections.length });
  }
  await advance(supabase, job, "map", { documents, docIndex: 0, sectionIndex: 0 });
}

// map: structured notes per section, a couple of model calls per request.
async function stepMap(supabase: SupabaseClient, job: SummaryJob) {
  const { documents = [], docIndex = 0, sectionIndex = 0 } = job.cursor;
  const current = documents[docIndex];
  if (!current) return advance(supabase, job, "reduce");

  const sections = replanSections(await documentPages(supabase, current.documentId), current.outline);
  const progress = await mapSections({
    sections,
    store: createSectionStore(supabase, current.documentId, job.user_id),
    mapper: createSectionMapper(await courseName(supabase, job.course_id)),
    startIndex: sectionIndex,
    maxCalls: MAP_CALLS_PER_REQUEST,
  });

  const before = documents.slice(0, docIndex).reduce((sum, d) => sum + d.sections, 0);
  const total = documents.reduce((sum, d) => sum + d.sections, 0) || 1;
  const done = before + progress.nextIndex;

  const cursor: JobCursor = progress.done
    ? { documents, docIndex: docIndex + 1, sectionIndex: 0 }
    : { documents, docIndex, sectionIndex: progress.nextIndex };
  await setJob(supabase, job, { cursor, progress: stepProgress("map", done / total) });
}

// reduce: write the summary from all section notes and keep it as a draft.
async function stepReduce(supabase: SupabaseClient, job: SummaryJob) {
  const scope = scopeOf(job);
  const { entries, tagFor } = await loadScopeEntries(supabase, scope);
  const docs = await scopeDocuments(supabase, job);
  const scopeLabel = job.scope === "week" ? `${job.week_number}. hafta (${docs.length} doküman)` : docs[0].title;

  const result = await reduceToSummary({
    entries,
    tagFor,
    level: job.level,
    courseName: await courseName(supabase, job.course_id),
    scopeLabel,
  });
  const saved = await saveSummary(supabase, {
    ...scope,
    userId: job.user_id,
    level: job.level,
    contentMd: result.contentMd,
    model: process.env.AI_MODEL_CHAT ?? "",
    status: "draft",
    verification: { reduce: { rounds: result.rounds, groupMerges: result.groupMerges } },
  });
  await setJob(supabase, job, { summary_id: saved.id });
  await advance(supabase, job, "coverage");
}

// coverage: every topic/definition/formula of the notes must appear; missing parts are added.
async function stepCoverage(supabase: SupabaseClient, job: SummaryJob) {
  const scope = scopeOf(job);
  const [md, { entries, tagFor }, topics] = await Promise.all([
    currentSummary(supabase, job),
    loadScopeEntries(supabase, scope),
    loadTopics(supabase, scope),
  ]);

  const { contentMd, report } = await ensureCoverage({ summaryMd: md, entries, tagFor, level: job.level, topics });
  await updateSummary(supabase, job.summary_id!, {
    contentMd,
    coverage: report.coverage,
    verification: { coverage: report },
  });
  await advance(supabase, job, "verify", { verified: 0, verdicts: [] });
}

// verify: one batch of claims per request; the corrections are applied after the last batch.
async function stepVerify(supabase: SupabaseClient, job: SummaryJob) {
  const scope = scopeOf(job);
  const md = await currentSummary(supabase, job);
  const claims = parseClaims(md);
  const { verified = 0, verdicts = [] } = job.cursor;

  let allVerdicts = verdicts;
  let count = verified;
  if (count < claims.length) {
    const batch = claims.slice(count, count + VERIFY_BATCH_SIZE);
    const { weekNumber } = await loadScopeEntries(supabase, scope);
    const deps = createModelDeps(supabase, scope, weekNumber);
    allVerdicts = [...verdicts, ...(await verifyBatch(batch, deps, await loadScopePages(supabase, scope)))];
    count += batch.length;
  }

  if (count < claims.length) {
    await setJob(supabase, job, {
      cursor: { verified: count, verdicts: allVerdicts },
      progress: stepProgress("verify", count / claims.length),
    });
    return;
  }

  await updateSummary(supabase, job.summary_id!, {
    contentMd: fillEmptySections(applyVerdicts(md, claims, allVerdicts)),
    status: "ready",
    verification: { verification: buildReport(claims, allVerdicts) },
  });
  await setJob(supabase, job, { step: "done", progress: 100, cursor: {} });
}

function viewOf(job: SummaryJob): SummaryJobView {
  return { step: job.step, progress: job.progress, error: job.error, summaryId: job.summary_id };
}

function describeError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  return `Özet hazırlanırken bir hata oluştu: ${error instanceof Error ? error.message : "bilinmeyen hata"}`;
}

// Runs one slice of work for the job. Safe to call repeatedly until the step is done or failed.
export async function runSummaryStep(supabase: SupabaseClient, jobId: string): Promise<SummaryJobView> {
  const { data: job } = await supabase.from("summary_jobs").select("*").eq("id", jobId).maybeSingle<SummaryJob>();
  if (!job) fail("Özet işi bulunamadı.");
  if (job.step === "done" || job.step === "failed") return viewOf(job);

  const step = job.step;
  try {
    switch (step) {
      case "transcribe":
        await stepTranscribe(supabase, job);
        break;
      case "section":
        await stepSection(supabase, job);
        break;
      case "map":
        await stepMap(supabase, job);
        break;
      case "reduce":
        await stepReduce(supabase, job);
        break;
      case "coverage":
        await stepCoverage(supabase, job);
        break;
      case "verify":
        await stepVerify(supabase, job);
        break;
    }
  } catch (error) {
    await setJob(supabase, job, { step: "failed", error: describeError(error), failed_step: step });
    if (job.summary_id) await updateSummary(supabase, job.summary_id, { status: "failed" }).catch(() => undefined);
  }
  return viewOf(job);
}

export type StartInput = { courseId: string; level: SummaryLevel } & (
  | { scope: "document"; documentId: string }
  | { scope: "week"; weekNumber: number }
);

// Creates a job, or continues the unfinished one for the same target (a failed job resumes at the step
// where it stopped). A finished job is never reused: asking again makes a new version.
export async function startSummaryJob(supabase: SupabaseClient, input: StartInput): Promise<string> {
  let existingQuery = supabase
    .from("summary_jobs")
    .select("id, step, failed_step")
    .eq("course_id", input.courseId)
    .eq("scope", input.scope)
    .eq("level", input.level)
    .order("updated_at", { ascending: false })
    .limit(1);
  existingQuery =
    input.scope === "document" ? existingQuery.eq("document_id", input.documentId) : existingQuery.eq("week_number", input.weekNumber);

  const { data: existing } = await existingQuery.maybeSingle();
  if (existing && existing.step !== "done") {
    if (existing.step === "failed") {
      const step = (existing.failed_step as SummaryStep | null) ?? "transcribe";
      await supabase.from("summary_jobs").update({ step, error: null, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data, error } = await supabase
    .from("summary_jobs")
    .insert({
      course_id: input.courseId,
      scope: input.scope,
      document_id: input.scope === "document" ? input.documentId : null,
      week_number: input.scope === "week" ? input.weekNumber : null,
      level: input.level,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "İş oluşturulamadı.");
  return data.id;
}
