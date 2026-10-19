import type { SupabaseClient } from "@supabase/supabase-js";
import { citationLabel } from "./search";

// ~12k tokens (about 4 characters per token) of notes per week.
export const WEEK_CHAR_BUDGET = 48_000;

export type WeekChunk = {
  id: string;
  document_id: string;
  week_number: number;
  page_start: number;
  page_end: number;
  heading: string | null;
  content: string;
  label: string;
};

export type WeekContent = {
  week: number;
  title: string | null;
  summary: string | null;
  topics: { name: string; description: string | null }[];
  chunks: WeekChunk[];
  truncated: boolean;
};

// Keeps the chunk order but drops evenly spaced chunks until the text fits the budget,
// so every part of the week stays represented.
export function fitChunksToBudget<T extends { content: string }>(
  chunks: T[],
  maxChars = WEEK_CHAR_BUDGET,
): { chunks: T[]; truncated: boolean } {
  const total = chunks.reduce((sum, c) => sum + c.content.length, 0);
  if (total <= maxChars) return { chunks, truncated: false };

  // Bresenham-style sampling: keep roughly maxChars/total of the chunks, evenly spread.
  const ratio = (maxChars / total) * 0.95;
  const sampled = chunks.filter((_, i) => Math.floor((i + 1) * ratio) > Math.floor(i * ratio));

  const kept: T[] = [];
  let used = 0;
  for (const chunk of sampled) {
    if (used + chunk.content.length > maxChars) break;
    kept.push(chunk);
    used += chunk.content.length;
  }
  return { chunks: kept.length > 0 ? kept : chunks.slice(0, 1), truncated: true };
}

export async function getWeekContent(
  supabase: SupabaseClient,
  courseId: string,
  week: number,
): Promise<WeekContent | null> {
  const [{ data: weekRow }, { data: topics }, { data: chunks, error }] = await Promise.all([
    supabase
      .from("weeks")
      .select("title, summary")
      .eq("course_id", courseId)
      .eq("week_number", week)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("name, description")
      .eq("course_id", courseId)
      .eq("week_number", week)
      .order("name"),
    supabase
      .from("chunks")
      .select("id, document_id, week_number, page_start, page_end, heading, content")
      .eq("course_id", courseId)
      .eq("week_number", week)
      .order("document_id")
      .order("chunk_index"),
  ]);
  if (error) throw new Error(error.message);
  if (!chunks?.length) return null;

  const fitted = fitChunksToBudget(chunks);
  return {
    week,
    title: weekRow?.title ?? null,
    summary: weekRow?.summary ?? null,
    topics: topics ?? [],
    chunks: fitted.chunks.map((c) => ({ ...c, label: citationLabel(c) })),
    truncated: fitted.truncated,
  };
}

// Formats a week's notes for the model: each note starts with its citation label.
export function formatWeekForPrompt(content: WeekContent): string {
  const topics = content.topics.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`).join("\n");
  const notes = content.chunks.map((c) => `${c.label}\n${c.content}`).join("\n\n---\n\n");
  return [
    `Hafta ${content.week}${content.title ? `: ${content.title}` : ""}`,
    topics && `Konular:\n${topics}`,
    content.truncated && "(Notlar uzun olduğu için bazı bölümler atlandı.)",
    `<notlar>\n${notes}\n</notlar>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
