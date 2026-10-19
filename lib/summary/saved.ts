import type { SupabaseClient } from "@supabase/supabase-js";
import type { SummaryLevel } from "./template";

export type SavedSummary = { id: string; level: SummaryLevel; version: number; contentMd: string };

type Row = { id: string; level: string; version: number; content_md: string };

// Level preference when the asker does not name one: the standard summary, then the others.
const FALLBACK_ORDER: SummaryLevel[] = ["standard", "detailed", "short"];

// Picks the newest ready summary of the wanted level; if that level does not exist, the best other one.
// Rows must be sorted newest version first.
export function pickSavedSummary(rows: Row[], level?: SummaryLevel): SavedSummary | null {
  const order = level ? [level, ...FALLBACK_ORDER.filter((l) => l !== level)] : FALLBACK_ORDER;
  for (const wanted of order) {
    const row = rows.find((r) => r.level === wanted);
    if (row) return { id: row.id, level: wanted, version: row.version, contentMd: row.content_md };
  }
  return null;
}

// The saved (generated and verified) summary of a week, if one exists.
export async function getSavedWeekSummary(
  supabase: SupabaseClient,
  courseId: string,
  week: number,
  level?: SummaryLevel,
): Promise<SavedSummary | null> {
  const { data, error } = await supabase
    .from("summaries")
    .select("id, level, version, content_md")
    .eq("course_id", courseId)
    .eq("scope", "week")
    .eq("week_number", week)
    .eq("status", "ready")
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return pickSavedSummary((data ?? []) as Row[], level);
}
