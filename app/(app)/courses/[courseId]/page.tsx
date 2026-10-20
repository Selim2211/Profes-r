import { ChevronLeft, ChevronRight, FileText, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddWeekButton, CourseSettingsButton } from "@/components/course/course-actions";
import { initialsOf, tintFor } from "@/components/course/course-grid";
import { createClient } from "@/lib/supabase/server";

type WeekCard = { week: number; title: string | null; files: number; processing: number; hasSummary: boolean };

async function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();

  // One round of parallel queries: everything the page shows.
  const [{ data: course }, { data: weeks }, { data: documents }, { data: summaries }] = await Promise.all([
    supabase.from("courses").select("id, name, code, description").eq("id", courseId).maybeSingle(),
    supabase.from("weeks").select("week_number, title, summary").eq("course_id", courseId),
    supabase.from("documents").select("week_number, status").eq("course_id", courseId),
    supabase.from("summaries").select("week_number").eq("course_id", courseId).eq("scope", "week").eq("status", "ready"),
  ]);
  if (!course) notFound();

  // Weeks the user created, plus any week that only exists because notes were uploaded to it earlier.
  const cards = new Map<number, WeekCard>();
  const card = (week: number): WeekCard => {
    let existing = cards.get(week);
    if (!existing) {
      existing = { week, title: null, files: 0, processing: 0, hasSummary: false };
      cards.set(week, existing);
    }
    return existing;
  };
  for (const w of weeks ?? []) {
    const c = card(w.week_number);
    c.title = w.title;
    if (w.summary) c.hasSummary = true;
  }
  for (const d of documents ?? []) {
    if (d.week_number === null) continue;
    const c = card(d.week_number);
    c.files++;
    if (d.status !== "ready" && d.status !== "failed") c.processing++;
  }
  for (const s of summaries ?? []) {
    if (s.week_number !== null) card(s.week_number).hasSummary = true;
  }
  const list = [...cards.values()].sort((a, b) => a.week - b.week);
  const nextWeek = (list.at(-1)?.week ?? 0) + 1;
  const tint = tintFor(course.name);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/courses"
          className="inline-flex h-9 items-center gap-1 rounded-lg pr-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Derslerim
        </Link>
        <div className={`relative mt-2 overflow-hidden rounded-2xl p-6 pl-7 ring-1 ring-border ${tint.soft}`}>
          <span className={`absolute inset-y-0 left-0 w-1.5 ${tint.spine}`} aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-4">
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-semibold ${tint.chip}`}>
                {initialsOf(course.name)}
              </span>
              <div className="min-w-0">
                {course.code && <p className="text-sm font-medium text-muted-foreground">{course.code}</p>}
                <h1 className="font-heading text-2xl font-semibold tracking-tight md:text-3xl">{course.name}</h1>
                {course.description && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{course.description}</p>}
              </div>
            </div>
            <CourseSettingsButton courseId={course.id} course={course} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Haftalar</h2>
        <AddWeekButton courseId={course.id} nextWeek={nextWeek} />
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Layers className="size-6" />
          </span>
          <p className="font-heading text-xl font-semibold">Henüz hafta yok</p>
          <p className="text-sm text-muted-foreground">&quot;Hafta ekle&quot; ile 1. haftayı oluştur, sonra notlarını içine sürükle.</p>
        </div>
      ) : (
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
          {list.map((w) => (
            <li key={w.week}>
              <Link
                href={`/courses/${course.id}/week/${w.week}`}
                className="group flex h-full cursor-pointer flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Hafta</p>
                    <p className="font-heading text-5xl leading-none font-semibold text-primary">{w.week}</p>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="min-h-10 flex-1 text-sm leading-snug text-foreground/80">{w.title || "Başlık yok"}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
                    <FileText className="size-3" />
                    {w.files} dosya
                  </span>
                  {w.processing > 0 ? (
                    <span className="rounded-md bg-warning/15 px-2 py-1 font-medium text-warning">İşleniyor</span>
                  ) : w.hasSummary ? (
                    <span className="rounded-md bg-success/15 px-2 py-1 font-medium text-success">Özet hazır</span>
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">Özet yok</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
            <div className="h-36 animate-pulse rounded-2xl bg-muted" />
            <div className="h-36 animate-pulse rounded-2xl bg-muted" />
          </div>
        </div>
      }
    >
      <CourseDetail params={params} />
    </Suspense>
  );
}
