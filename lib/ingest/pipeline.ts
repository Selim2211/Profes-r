import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkPages } from "./chunk";
import { cleanPages, type PageText } from "./clean";
import { cosineSimilarity, embedTexts } from "./embed";
import {
  MIN_TEXT_CHARS,
  extractPdfPages,
  isPdfPath,
  splitTextIntoPages,
} from "./extract";
import { ocrPages } from "./ocr";
import { summarizeWeek } from "./summarize";

const EXTRACT_SLICE_PAGES = 10;
const EMBED_SLICE_CHUNKS = 24;
const TOPICS_PER_CHUNK = 2;

type Stage = "extract" | "chunk" | "embed" | "summarize" | "done" | "failed";

type Job = {
  id: string;
  user_id: string;
  document_id: string;
  stage: Stage;
  next_page: number;
  progress: number;
  error: string | null;
  failed_stage: Stage | null;
};

type Doc = {
  id: string;
  user_id: string;
  course_id: string;
  week_number: number | null;
  title: string;
  storage_path: string;
  page_count: number | null;
};

export type JobView = {
  stage: Stage;
  progress: number;
  error: string | null;
  documentStatus: "pending" | "processing" | "ready" | "failed";
};

class UserFacingError extends Error {}

function fail(message: string): never {
  throw new UserFacingError(message);
}

async function setJob(supabase: SupabaseClient, job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
  const { error } = await supabase
    .from("ingestion_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
}

async function download(supabase: SupabaseClient, path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from("documents").download(path);
  if (error || !data) fail("Dosya depolamadan okunamadı.");
  return new Uint8Array(await data.arrayBuffer());
}

async function loadPages(supabase: SupabaseClient, documentId: string): Promise<PageText[]> {
  const { data, error } = await supabase
    .from("document_pages")
    .select("page_number, text")
    .eq("document_id", documentId)
    .order("page_number");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ page: p.page_number, text: p.text }));
}

async function runExtract(supabase: SupabaseClient, job: Job, doc: Doc) {
  const bytes = await download(supabase, doc.storage_path);
  const from = job.next_page;
  const to = from + EXTRACT_SLICE_PAGES - 1;

  let totalPages: number;
  let pages: PageText[];

  if (isPdfPath(doc.storage_path)) {
    ({ totalPages, pages } = await extractPdfPages(bytes, from, to));
  } else {
    const all = splitTextIntoPages(new TextDecoder().decode(bytes));
    totalPages = all.length;
    pages = all.filter((p) => p.page >= from && p.page <= to);
  }

  if (totalPages === 0) fail("Dosyada hiç sayfa bulunamadı.");
  if (from === 1 || doc.page_count !== totalPages) {
    await supabase.from("documents").update({ page_count: totalPages }).eq("id", doc.id);
  }

  // Resuming after a failure: do not redo (and re-OCR) pages that are already stored.
  const { data: existing } = await supabase
    .from("document_pages")
    .select("page_number")
    .eq("document_id", doc.id)
    .gte("page_number", from)
    .lte("page_number", to);
  const done = new Set((existing ?? []).map((p) => p.page_number));
  const todo = pages.filter((p) => !done.has(p.page));

  const emptyPages = isPdfPath(doc.storage_path)
    ? todo.filter((p) => p.text.trim().length < MIN_TEXT_CHARS).map((p) => p.page)
    : [];

  let ocrText = new Map<number, string>();
  if (emptyPages.length > 0) {
    try {
      ocrText = await ocrPages(bytes, emptyPages);
    } catch {
      // OCR is best effort; pages stay empty and the document fails later only if nothing readable remains.
    }
  }

  if (todo.length > 0) {
    const { error } = await supabase.from("document_pages").upsert(
      todo.map((p) => {
        const ocr = ocrText.get(p.page);
        return {
          document_id: doc.id,
          user_id: doc.user_id,
          page_number: p.page,
          text: ocr && ocr.length > 0 ? ocr : p.text,
          ocr_used: Boolean(ocr && ocr.length > 0),
        };
      }),
      { onConflict: "document_id,page_number" },
    );
    if (error) throw new Error(error.message);
  }

  const next = from + EXTRACT_SLICE_PAGES;
  if (next > totalPages) {
    await setJob(supabase, job, { stage: "chunk", next_page: 1, progress: 40 });
  } else {
    await setJob(supabase, job, {
      next_page: next,
      progress: Math.min(39, Math.floor((next / totalPages) * 40)),
    });
  }
}

async function runChunk(supabase: SupabaseClient, job: Job, doc: Doc) {
  const pages = await loadPages(supabase, doc.id);
  if (!pages.some((p) => p.text.trim().length > 0)) {
    fail("Dokümanda okunabilir metin bulunamadı. Taranmış bir PDF ise metin tanıma (OCR) başarısız olmuş olabilir.");
  }
  // Re-chunking from scratch keeps the step idempotent.
  const { error } = await supabase.from("chunks").delete().eq("document_id", doc.id);
  if (error) throw new Error(error.message);
  await setJob(supabase, job, { stage: "embed", next_page: 0, progress: 40 });
}

async function runEmbed(supabase: SupabaseClient, job: Job, doc: Doc) {
  const chunks = chunkPages(cleanPages(await loadPages(supabase, doc.id)));
  if (chunks.length === 0) fail("Dokümanda okunabilir metin bulunamadı.");

  const cursor = job.next_page;
  const slice = chunks.slice(cursor, cursor + EMBED_SLICE_CHUNKS);
  const embeddings = await embedTexts(slice.map((c) => c.content));

  const { error } = await supabase.from("chunks").upsert(
    slice.map((c, i) => ({
      user_id: doc.user_id,
      document_id: doc.id,
      course_id: doc.course_id,
      week_number: doc.week_number,
      page_start: c.pageStart,
      page_end: c.pageEnd,
      chunk_index: c.index,
      heading: c.heading,
      content: c.content,
      token_count: c.tokenCount,
      embedding: JSON.stringify(embeddings[i]),
    })),
    { onConflict: "document_id,chunk_index" },
  );
  if (error) throw new Error(error.message);

  const next = cursor + EMBED_SLICE_CHUNKS;
  if (next >= chunks.length) {
    await setJob(supabase, job, { stage: "summarize", next_page: 0, progress: 90 });
  } else {
    await setJob(supabase, job, {
      next_page: next,
      progress: 40 + Math.floor((next / chunks.length) * 50),
    });
  }
}

async function runSummarize(supabase: SupabaseClient, job: Job, doc: Doc) {
  const { data: course } = await supabase
    .from("courses")
    .select("name")
    .eq("id", doc.course_id)
    .single();

  // A week summary covers every document of that week; documents without a week stand alone.
  let query = supabase
    .from("chunks")
    .select("id, document_id, content, embedding")
    .eq("course_id", doc.course_id)
    .order("document_id")
    .order("chunk_index");
  query = doc.week_number === null ? query.eq("document_id", doc.id) : query.eq("week_number", doc.week_number);

  const { data: chunks, error } = await query;
  if (error) throw new Error(error.message);
  if (!chunks?.length) fail("Özet için parça bulunamadı.");

  const summary = await summarizeWeek({
    courseName: course?.name ?? "",
    weekNumber: doc.week_number,
    chunkTexts: chunks.map((c) => c.content),
  });

  const { data: topics, error: topicError } = await supabase
    .from("topics")
    .upsert(
      summary.topics.map((t) => ({
        user_id: doc.user_id,
        course_id: doc.course_id,
        week_number: doc.week_number,
        name: t.name.trim(),
        description: t.description,
      })),
      { onConflict: "course_id,name" },
    )
    .select("id, name, description");
  if (topicError) throw new Error(topicError.message);

  // Link each chunk of this document to its most similar topics.
  const topicVectors = await embedTexts((topics ?? []).map((t) => `${t.name}: ${t.description ?? ""}`));
  const links: { chunk_id: string; topic_id: string }[] = [];
  for (const chunk of chunks.filter((c) => c.document_id === doc.id)) {
    const vector: number[] = typeof chunk.embedding === "string" ? JSON.parse(chunk.embedding) : chunk.embedding;
    (topics ?? [])
      .map((t, i) => ({ id: t.id, score: cosineSimilarity(vector, topicVectors[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOPICS_PER_CHUNK)
      .forEach((t) => links.push({ chunk_id: chunk.id, topic_id: t.id }));
  }
  if (links.length > 0) {
    const { error: linkError } = await supabase
      .from("chunk_topics")
      .upsert(links, { onConflict: "chunk_id,topic_id", ignoreDuplicates: true });
    if (linkError) throw new Error(linkError.message);
  }

  if (doc.week_number !== null) {
    const { data: week } = await supabase
      .from("weeks")
      .select("title")
      .eq("course_id", doc.course_id)
      .eq("week_number", doc.week_number)
      .maybeSingle();
    const { error: weekError } = await supabase.from("weeks").upsert(
      {
        user_id: doc.user_id,
        course_id: doc.course_id,
        week_number: doc.week_number,
        title: week?.title ?? summary.weekTitle,
        summary: summary.summary,
        summary_updated_at: new Date().toISOString(),
      },
      { onConflict: "course_id,week_number" },
    );
    if (weekError) throw new Error(weekError.message);
  }

  await setJob(supabase, job, { stage: "done", progress: 100 });
  await supabase.from("documents").update({ status: "ready", error: null }).eq("id", doc.id);
}

function currentStage(job: Job): Stage {
  return job.stage;
}

function describeError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  const detail = error instanceof Error ? error.message : "bilinmeyen hata";
  return `Doküman işlenirken bir hata oluştu: ${detail}`;
}

// Runs one slice of work for the job and persists progress. Safe to call repeatedly.
export async function runIngestStep(supabase: SupabaseClient, jobId: string): Promise<JobView> {
  const { data: job } = await supabase.from("ingestion_jobs").select("*").eq("id", jobId).maybeSingle<Job>();
  if (!job) fail("İşleme işi bulunamadı.");

  const { data: doc } = await supabase
    .from("documents")
    .select("id, user_id, course_id, week_number, title, storage_path, page_count")
    .eq("id", job.document_id)
    .maybeSingle<Doc>();
  if (!doc) fail("Doküman bulunamadı.");

  if (job.stage === "done" || job.stage === "failed") {
    return {
      stage: job.stage,
      progress: job.progress,
      error: job.error,
      documentStatus: job.stage === "done" ? "ready" : "failed",
    };
  }

  try {
    await supabase.from("documents").update({ status: "processing", error: null }).eq("id", doc.id);

    switch (job.stage) {
      case "extract":
        await runExtract(supabase, job, doc);
        break;
      case "chunk":
        await runChunk(supabase, job, doc);
        break;
      case "embed":
        await runEmbed(supabase, job, doc);
        break;
      case "summarize":
        await runSummarize(supabase, job, doc);
        break;
    }
  } catch (error) {
    const message = describeError(error);
    const failedStage = job.stage;
    await setJob(supabase, job, { stage: "failed", error: message, failed_stage: failedStage });
    await supabase.from("documents").update({ status: "failed", error: message }).eq("id", doc.id);
  }

  // setJob mutates the job, so widen the type again after the narrowing above.
  const stage = currentStage(job);
  return {
    stage,
    progress: job.progress,
    error: job.error,
    documentStatus: stage === "done" ? "ready" : stage === "failed" ? "failed" : "processing",
  };
}

// Creates a job for the document, or revives a failed one at the stage where it stopped.
export async function startIngestJob(supabase: SupabaseClient, documentId: string): Promise<string> {
  const { data: doc } = await supabase.from("documents").select("id").eq("id", documentId).maybeSingle();
  if (!doc) fail("Doküman bulunamadı.");

  const { data: existing } = await supabase
    .from("ingestion_jobs")
    .select("*")
    .eq("document_id", documentId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<Job>();

  if (existing && existing.stage !== "done") {
    if (existing.stage === "failed") {
      await supabase
        .from("ingestion_jobs")
        .update({ stage: existing.failed_stage ?? "extract", error: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      await supabase.from("documents").update({ status: "pending", error: null }).eq("id", documentId);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("ingestion_jobs")
    .insert({ document_id: documentId })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "İş oluşturulamadı.");
  return created.id;
}
