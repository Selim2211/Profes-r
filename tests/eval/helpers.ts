import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appendFileSync } from "node:fs";

// Service-role client: the eval reads one owner's data directly, RLS does not apply.
export function evalClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export const REPORT_FILE = "tests/eval/report.txt";

export function report(line: string) {
  appendFileSync(REPORT_FILE, `${line}\n`);
}

export async function findDocument(supabase: SupabaseClient, title: string) {
  // Several uploads can share a title; prefer the newest one that has a ready summary.
  const { data } = await supabase
    .from("documents")
    .select("id, course_id, week_number, title, status")
    .eq("title", title)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  return data ?? [];
}
