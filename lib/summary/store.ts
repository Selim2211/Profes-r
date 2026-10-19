import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionStore, StoredSection } from "./map";
import { makeTagFor, type NoteEntry, type TagFor } from "./notes";
import type { Topic } from "./coverage";
import { segmentsByHeadings } from "./sections";
import type { SummaryLevel } from "./template";

export type SummaryScope =
  | { scope: "document"; courseId: string; documentId: string }
  | { scope: "week"; courseId: string; weekNumber: number };

function toEntry(row: StoredSection): NoteEntry {
  return { title: row.title, pageStart: row.page_start, pageEnd: row.page_end, notes: row.content };
}

// All stored section notes for a summary scope, in reading order. A week gathers every ready
// document of that week, so a second document is covered together with the first.
export async function loadScopeEntries(
  supabase: SupabaseClient,
  target: SummaryScope,
): Promise<{ entries: NoteEntry[]; tagFor: TagFor; weekNumber: number | null }> {
  let documents: { id: string; week_number: number | null }[];

  if (target.scope === "document") {
    const { data, error } = await supabase
      .from("documents")
      .select("id, week_number")
      .eq("id", target.documentId)
      .eq("course_id", target.courseId);
    if (error) throw new Error(error.message);
    documents = data ?? [];
  } else {
    const { data, error } = await supabase
      .from("documents")
      .select("id, week_number")
      .eq("course_id", target.courseId)
      .eq("week_number", target.weekNumber)
      .eq("status", "ready")
      .order("created_at");
    if (error) throw new Error(error.message);
    documents = data ?? [];
  }

  const entries: NoteEntry[] = [];
  for (const doc of documents) {
    const { data, error } = await supabase
      .from("section_summaries")
      .select("section_index, title, page_start, page_end, source_hash, content")
      .eq("document_id", doc.id)
      .order("section_index");
    if (error) throw new Error(error.message);
    entries.push(...((data ?? []) as StoredSection[]).map(toEntry));
  }

  const weekNumber = target.scope === "week" ? target.weekNumber : (documents[0]?.week_number ?? null);
  return { entries, tagFor: makeTagFor(weekNumber), weekNumber };
}

// Headings found in the stored pages of the scope's documents (e.g. every slide title), in order,
// each with the text written under it.
export async function loadTopics(supabase: SupabaseClient, target: SummaryScope): Promise<Topic[]> {
  let query = supabase.from("documents").select("id").eq("course_id", target.courseId);
  query =
    target.scope === "document"
      ? query.eq("id", target.documentId)
      : query.eq("week_number", target.weekNumber).eq("status", "ready");
  const { data: documents, error } = await query.order("created_at");
  if (error) throw new Error(error.message);

  const topics: Topic[] = [];
  for (const doc of documents ?? []) {
    const { data: rows, error: pagesError } = await supabase
      .from("document_pages")
      .select("page_number, text")
      .eq("document_id", doc.id)
      .order("page_number");
    if (pagesError) throw new Error(pagesError.message);

    const pages = (rows ?? []).map((r) => ({ page: r.page_number as number, text: r.text as string }));
    for (const segment of segmentsByHeadings(pages)) {
      if (!segment.title) continue;
      topics.push({
        title: segment.title,
        content: segment.blocks.map((b) => b.text).join("\n"),
        pageStart: segment.blocks[0].page,
        pageEnd: segment.blocks[segment.blocks.length - 1].page,
      });
    }
  }
  return topics;
}

export type SummaryPatch = {
  contentMd?: string;
  coverage?: number | null;
  status?: "draft" | "ready" | "failed";
  // Merged into the stored verification object (keys not mentioned are kept).
  verification?: Record<string, unknown>;
};

// Updates a draft summary in place while the pipeline is still running (coverage, verification).
// User edits and regenerations must go through saveSummary so earlier versions are kept.
export async function updateSummary(supabase: SupabaseClient, id: string, patch: SummaryPatch): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.contentMd !== undefined) update.content_md = patch.contentMd;
  if (patch.coverage !== undefined) update.coverage = patch.coverage;
  if (patch.status !== undefined) update.status = patch.status;

  if (patch.verification) {
    const { data, error } = await supabase.from("summaries").select("verification").eq("id", id).single();
    if (error) throw new Error(error.message);
    update.verification = { ...((data?.verification as Record<string, unknown> | null) ?? {}), ...patch.verification };
  }

  const { error } = await supabase.from("summaries").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export type SaveSummaryInput = SummaryScope & {
  userId: string;
  level: SummaryLevel;
  contentMd: string;
  model: string;
  coverage?: number | null;
  verification?: unknown;
  status?: "draft" | "ready" | "failed";
};

// Every save is a new version; earlier versions are kept.
export async function saveSummary(supabase: SupabaseClient, input: SaveSummaryInput): Promise<{ id: string; version: number }> {
  let latest = supabase
    .from("summaries")
    .select("version")
    .eq("course_id", input.courseId)
    .eq("scope", input.scope)
    .eq("level", input.level)
    .order("version", { ascending: false })
    .limit(1);
  latest =
    input.scope === "document"
      ? latest.eq("document_id", input.documentId)
      : latest.eq("week_number", input.weekNumber);

  const { data: previous, error: versionError } = await latest.maybeSingle();
  if (versionError) throw new Error(versionError.message);
  const version = (previous?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("summaries")
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      scope: input.scope,
      document_id: input.scope === "document" ? input.documentId : null,
      week_number: input.scope === "week" ? input.weekNumber : null,
      level: input.level,
      content_md: input.contentMd,
      coverage: input.coverage ?? null,
      verification: input.verification ?? null,
      status: input.status ?? "draft",
      version,
      model: input.model,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Özet kaydedilemedi.");
  return { id: data.id, version };
}

// section_summaries rows for one document. `userId` is written explicitly so the same code also
// works with a service-role client; with a user client RLS enforces ownership either way.
export function createSectionStore(supabase: SupabaseClient, documentId: string, userId: string): SectionStore {
  return {
    async list() {
      const { data, error } = await supabase
        .from("section_summaries")
        .select("section_index, title, page_start, page_end, source_hash, content")
        .eq("document_id", documentId)
        .order("section_index");
      if (error) throw new Error(error.message);
      return (data ?? []) as StoredSection[];
    },

    async save(row) {
      const { error } = await supabase
        .from("section_summaries")
        .upsert({ ...row, document_id: documentId, user_id: userId }, { onConflict: "document_id,section_index" });
      if (error) throw new Error(error.message);
    },

    async deleteFrom(index) {
      const { error } = await supabase
        .from("section_summaries")
        .delete()
        .eq("document_id", documentId)
        .gte("section_index", index);
      if (error) throw new Error(error.message);
    },
  };
}
