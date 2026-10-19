import { BookOpen, ChevronRight } from "lucide-react";
import Link from "next/link";
import { NewCourseButton } from "@/components/course/new-course-button";
import { createClient } from "@/lib/supabase/server";

const GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-fuchsia-500 to-purple-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
];

// Same course always gets the same color.
export function gradientFor(key: string): string {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export async function CourseGrid() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, code, description, weeks(count)")
    .order("created_at", { ascending: false });

  if (!courses?.length) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed bg-card/60 px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookOpen className="size-7" />
        </span>
        <div>
          <p className="font-semibold">Henüz dersin yok</p>
          <p className="mt-1 text-sm text-muted-foreground">İlk dersini oluştur, sonra haftalarını ve notlarını ekle.</p>
        </div>
        <NewCourseButton />
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const weekCount = (course.weeks as { count: number }[] | null)?.[0]?.count ?? 0;
        return (
          <li key={course.id}>
            <Link
              href={`/courses/${course.id}`}
              className="group block overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className={`h-20 bg-gradient-to-br ${gradientFor(course.name)} p-4`}>
                <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">
                  {course.code || "Ders"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{course.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{weekCount} hafta</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
