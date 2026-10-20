import { BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import { NewCourseButton } from "@/components/course/new-course-button";
import { createClient } from "@/lib/supabase/server";

// Soft course colors. Full class names are spelled out so Tailwind can see them.
const TINTS = [
  {
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200",
    spine: "bg-sky-500 dark:bg-sky-400",
    soft: "bg-sky-50 dark:bg-sky-400/10",
  },
  {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
    spine: "bg-emerald-500 dark:bg-emerald-400",
    soft: "bg-emerald-50 dark:bg-emerald-400/10",
  },
  {
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
    spine: "bg-amber-500 dark:bg-amber-400",
    soft: "bg-amber-50 dark:bg-amber-400/10",
  },
  {
    chip: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
    spine: "bg-rose-500 dark:bg-rose-400",
    soft: "bg-rose-50 dark:bg-rose-400/10",
  },
  {
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200",
    spine: "bg-violet-500 dark:bg-violet-400",
    soft: "bg-violet-50 dark:bg-violet-400/10",
  },
  {
    chip: "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-200",
    spine: "bg-teal-500 dark:bg-teal-400",
    soft: "bg-teal-50 dark:bg-teal-400/10",
  },
];

// The same course always gets the same color.
export function tintFor(key: string) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[hash % TINTS.length];
}

// Up to two letters shown on the course badge ("Diferansiyel Denklemler" -> "DD").
export function initialsOf(name: string): string {
  const words = name.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean);
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0] ?? "?"]).map((w) => [...w][0]);
  return letters.join("").toLocaleUpperCase("tr-TR");
}

export async function CourseGrid() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, code, description, weeks(count)")
    .order("created_at", { ascending: false });

  if (!courses?.length) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <BookOpen className="size-6" />
        </span>
        <div>
          <p className="font-heading text-xl font-semibold">Henüz dersin yok</p>
          <p className="mt-1 text-sm text-muted-foreground">İlk dersini oluştur, sonra haftalarını ve notlarını ekle.</p>
        </div>
        <NewCourseButton />
      </div>
    );
  }

  return (
    <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
      {courses.map((course) => {
        const weekCount = (course.weeks as { count: number }[] | null)?.[0]?.count ?? 0;
        const tint = tintFor(course.name);
        return (
          <li key={course.id}>
            <Link
              href={`/courses/${course.id}`}
              className="group relative flex h-full cursor-pointer items-start gap-4 overflow-hidden rounded-2xl bg-card p-5 pl-6 ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`absolute inset-y-0 left-0 w-1.5 ${tint.spine}`} aria-hidden />
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl font-heading text-lg font-semibold ${tint.chip}`}>
                {initialsOf(course.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg leading-snug font-semibold">{course.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.code ? `${course.code} · ` : ""}
                  {weekCount} hafta
                </p>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
