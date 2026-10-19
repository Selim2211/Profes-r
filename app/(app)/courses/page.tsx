import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourseForm } from "@/components/course/course-form";
import { createClient } from "@/lib/supabase/server";
import { createCourse } from "./actions";

async function CourseList() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, code, description")
    .order("created_at", { ascending: false });

  if (!courses?.length) {
    return <p className="text-sm text-muted-foreground">Henüz dersin yok. Aşağıdan ilk dersini ekle.</p>;
  }

  return (
    <ul className="space-y-3">
      {courses.map((course) => (
        <li key={course.id}>
          <Link href={`/courses/${course.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>
                  {course.name}
                  {course.code && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{course.code}</span>
                  )}
                </CardTitle>
              </CardHeader>
              {course.description && (
                <CardContent className="text-sm text-muted-foreground">{course.description}</CardContent>
              )}
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function CoursesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dersler</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
        <CourseList />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle>Yeni ders ekle</CardTitle>
        </CardHeader>
        <CardContent>
          <CourseForm action={createCourse} submitLabel="Ders oluştur" />
        </CardContent>
      </Card>
    </div>
  );
}
