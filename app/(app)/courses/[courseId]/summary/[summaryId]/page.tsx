import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SummaryView, type SummaryData } from "@/components/summary/summary-view";
import { createClient } from "@/lib/supabase/server";
import type { SummaryLevel } from "@/lib/summary/template";

type Params = Promise<{ courseId: string; summaryId: string }>;

async function SummaryContent({ params }: { params: Params }) {
  const { courseId, summaryId } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("summaries")
    .select("*")
    .eq("id", summaryId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!row) notFound();

  // Everything about the same target: all versions of this level, and the latest ready one per level.
  let sameTarget = supabase
    .from("summaries")
    .select("id, level, version, status, created_at")
    .eq("course_id", courseId)
    .eq("scope", row.scope)
    .order("version", { ascending: false });
  sameTarget =
    row.scope === "document" ? sameTarget.eq("document_id", row.document_id) : sameTarget.eq("week_number", row.week_number);

  const [{ data: related }, title] = await Promise.all([
    sameTarget,
    row.scope === "document"
      ? supabase.from("documents").select("title").eq("id", row.document_id).maybeSingle().then((r) => r.data?.title as string | undefined)
      : supabase
          .from("weeks")
          .select("title")
          .eq("course_id", courseId)
          .eq("week_number", row.week_number)
          .maybeSingle()
          .then((r) => `${row.week_number}. Hafta${r.data?.title ? `: ${r.data.title}` : ""}`),
  ]);

  // Unfinished or failed runs are not versions the reader should see (the one being viewed always is).
  const versions = (related ?? [])
    .filter((r) => r.level === row.level && (r.status === "ready" || r.id === row.id))
    .map((r) => ({ id: r.id, version: r.version, createdAt: r.created_at, status: r.status }));

  const levels: Partial<Record<SummaryLevel, { id: string; version: number }>> = {};
  for (const r of related ?? []) {
    if (r.status === "ready" && !levels[r.level as SummaryLevel]) levels[r.level as SummaryLevel] = { id: r.id, version: r.version };
  }

  const summary: SummaryData = {
    id: row.id,
    contentMd: row.content_md,
    level: row.level,
    version: row.version,
    status: row.status,
    coverage: row.coverage,
    verification: row.verification,
    createdAt: row.created_at,
    weekNumber: row.week_number,
    documentId: row.document_id,
    scope: row.scope,
  };

  return (
    <SummaryView courseId={courseId} title={title ?? "Özet"} summary={summary} versions={versions} levels={levels} />
  );
}

export default function SummaryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <SummaryContent params={params} />
    </Suspense>
  );
}
