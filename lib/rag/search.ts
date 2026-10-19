import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/ingest/embed";

export const MATCH_COUNT = 8;

export type NoteHit = {
  id: string;
  document_id: string;
  course_id: string;
  week_number: number | null;
  page_start: number;
  page_end: number;
  heading: string | null;
  content: string;
  score: number;
};

export type Citation = {
  chunk_id: string;
  document_id: string;
  week: number | null;
  page: number;
};

// Short label used in answers, e.g. "[H3 · s.12]".
export function citationLabel(hit: Pick<NoteHit, "week_number" | "page_start" | "page_end">): string {
  const week = hit.week_number === null ? "Not" : `H${hit.week_number}`;
  const page = hit.page_start === hit.page_end ? `${hit.page_start}` : `${hit.page_start}-${hit.page_end}`;
  return `[${week} · s.${page}]`;
}

export function toCitation(hit: NoteHit): Citation {
  return {
    chunk_id: hit.id,
    document_id: hit.document_id,
    week: hit.week_number,
    page: hit.page_start,
  };
}

// Hybrid (vector + full text) search over the user's notes via the match_chunks RPC.
export async function searchNotes(
  supabase: SupabaseClient,
  params: { query: string; courseId?: string | null; weeks?: number[] | null },
): Promise<NoteHit[]> {
  const [embedding] = await embedTexts([params.query]);
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: JSON.stringify(embedding),
    query_text: params.query,
    p_course_id: params.courseId ?? null,
    p_weeks: params.weeks?.length ? params.weeks : null,
    match_count: MATCH_COUNT,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as NoteHit[];
}
