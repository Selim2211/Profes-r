import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteDocument } from "@/app/(app)/courses/actions";
import { DocumentRow } from "@/components/course/document-row";
import { WeekDangerZone } from "@/components/course/week-danger-zone";
import { WeekSummary, type SavedLevelSummary } from "@/components/course/week-summary";
import { WeekUploader } from "@/components/course/week-uploader";
import { createClient } from "@/lib/supabase/server";
import type { SummaryLevel } from "@/lib/summary/template";

type Params = Promise<{ courseId: string; n: string }>;

async function WeekContent({ params }: { params: Params }) {
  const { courseId, n } = await params;
  const week = Number(n);
  if (!Number.isInteger(week) || week < 1 || week > 52) notFound();

  const supabase = await createClient();
  // Everything the page shows in one parallel round: nothing here calls a model.
  const [{ data: course }, { data: weekRow }, { data: topics }, { data: documents }, { data: summaries }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("id", courseId).maybeSingle(),
    supabase.from("weeks").select("title, summary").eq("course_id", courseId).eq("week_number", week).maybeSingle(),
    supabase.from("topics").select("name, description").eq("course_id", courseId).eq("week_number", week).order("name"),
    supabase
      .from("documents")
      .select("id, title, status, error, page_count")
      .eq("course_id", courseId)
      .eq("week_number", week)
      .order("created_at"),
    supabase
      .from("summaries")
      .select("id, level, version, content_md")
      .eq("course_id", courseId)
      .eq("scope", "week")
      .eq("week_number", week)
      .eq("status", "ready")
      .order("version", { ascending: false }),
  ]);
  if (!course) notFound();

  // Rows come newest version first: keep the first one of every level.
  const latest = new Map<SummaryLevel, SavedLevelSummary>();
  for (const s of summaries ?? []) {
    if (!latest.has(s.level as SummaryLevel)) {
      latest.set(s.level as SummaryLevel, { id: s.id, level: s.level as SummaryLevel, version: s.version, contentMd: s.content_md });
    }
  }

  const docs = documents ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex h-9 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {course.name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          {week}. Hafta
          {weekRow?.title && <span className="font-medium text-muted-foreground"> · {weekRow.title}</span>}
        </h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Notlar</h2>
        <WeekUploader courseId={courseId} week={week} />
        {docs.length > 0 && (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <DocumentRow
                key={doc.id}
                id={doc.id}
                title={doc.title}
                status={doc.status}
                error={doc.error}
                pageCount={doc.page_count}
                deleteAction={deleteDocument.bind(null, courseId, week, doc.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <WeekSummary
        courseId={courseId}
        week={week}
        summaries={[...latest.values()]}
        quickSummary={weekRow?.summary ?? null}
        topics={topics ?? []}
        hasNotes={docs.some((d) => d.status === "ready")}
      />

      <WeekDangerZone courseId={courseId} week={week} />
    </div>
  );
}

export default function WeekPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-56 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          <div className="h-64 animate-pulse rounded-3xl bg-muted" />
        </div>
      }
    >
      <WeekContent params={params} />
    </Suspense>
  );
}
