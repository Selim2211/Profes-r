import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { WeekView } from "@/components/course/week-view";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ courseId: string; n: string }>;

async function WeekContent({ params }: { params: Params }) {
  const { courseId, n } = await params;
  const week = Number(n);
  if (!Number.isInteger(week) || week < 1 || week > 52) notFound();

  const supabase = await createClient();
  const [{ data: course }, { data: weekRow }, { data: topics }] = await Promise.all([
    supabase.from("courses").select("id, name").eq("id", courseId).maybeSingle(),
    supabase.from("weeks").select("title, summary").eq("course_id", courseId).eq("week_number", week).maybeSingle(),
    supabase.from("topics").select("name, description").eq("course_id", courseId).eq("week_number", week).order("name"),
  ]);
  if (!course) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/courses/${courseId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {course.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {week}. Hafta{weekRow?.title ? `: ${weekRow.title}` : ""}
        </h1>
      </div>
      <WeekView courseId={courseId} week={week} summary={weekRow?.summary ?? null} topics={topics ?? []} />
    </div>
  );
}

export default function WeekPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <WeekContent params={params} />
    </Suspense>
  );
}
