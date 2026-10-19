import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseForm } from "@/components/course/course-form";
import { createClient } from "@/lib/supabase/server";
import { deleteCourse, updateCourse } from "../actions";

async function CourseDetail({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id, name, code, description")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{course.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Dersi düzenle</CardTitle>
        </CardHeader>
        <CardContent>
          <CourseForm
            action={updateCourse.bind(null, course.id)}
            submitLabel="Kaydet"
            defaults={course}
          />
        </CardContent>
      </Card>
      <form action={deleteCourse.bind(null, course.id)}>
        <Button type="submit" variant="destructive" className="h-11">
          Dersi sil
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Dersi silmek ona bağlı tüm haftaları ve notları da siler.
        </p>
      </form>
    </div>
  );
}

export default function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <CourseDetail params={params} />
    </Suspense>
  );
}
