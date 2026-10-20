import { Suspense } from "react";
import { CourseGrid } from "@/components/course/course-grid";
import { NewCourseButton } from "@/components/course/new-course-button";

export default function CoursesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Derslerim</h1>
        <NewCourseButton />
      </div>
      <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl bg-muted" />}>
        <CourseGrid />
      </Suspense>
    </div>
  );
}
