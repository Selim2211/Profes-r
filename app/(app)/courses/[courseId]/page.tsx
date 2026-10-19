import { ChevronLeft, ChevronRight, FileText, Layers } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddWeekButton, CourseSettingsButton } from "@/components/course/course-actions";
import { gradientFor } from "@/components/course/course-grid";
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
        <div className={`mt-2 overflow-hidden rounded-3xl bg-gradient-to-br ${gradientFor(course.name)} p-6 text-white shadow-lg`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {course.code && (
                <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
                  {course.code}
                </span>
              )}
              <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{course.name}</h1>
              {course.description && <p className="mt-1 max-w-xl text-sm text-white/85">{course.description}</p>}
            </div>
            <div className="shrink-0 rounded-xl bg-white/90 text-slate-800">
              <CourseSettingsButton courseId={course.id} course={course} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Haftalar</h2>
        <AddWeekButton courseId={course.id} nextWeek={nextWeek} />
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed bg-card/60 px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Layers className="size-7" />
          </span>
          <p className="font-semibold">Henüz hafta yok</p>
          <p className="text-sm text-muted-foreground">&quot;Hafta ekle&quot; ile 1. haftayı oluştur, sonra notlarını içine sürükle.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <li key={w.week}>
              <Link
                href={`/courses/${course.id}/week/${w.week}`}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                    {w.week}
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{w.week}. Hafta</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{w.title || "Başlıksız"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                    <FileText className="size-3" />
                    {w.files} dosya
                  </span>
                  {w.processing > 0 ? (
                    <span className="rounded-full bg-warning/15 px-2.5 py-1 font-medium text-warning">İşleniyor</span>
                  ) : w.hasSummary ? (
                    <span className="rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">Özet hazır</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">Özet yok</span>
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
          <div className="h-36 animate-pulse rounded-3xl bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
