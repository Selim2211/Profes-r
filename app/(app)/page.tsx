import { Suspense } from "react";
import { CourseGrid } from "@/components/course/course-grid";
import { NewCourseButton } from "@/components/course/new-course-button";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Hoş geldin</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Bugün ne çalışıyoruz?</h1>
        <p className="max-w-xl text-muted-foreground">
          Dersini seç, haftaya notlarını yükle. Özetini bir kere çıkarırız, istediğin zaman açıp okursun.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Derslerim</h2>
          <NewCourseButton />
        </div>
        <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl bg-muted" />}>
          <CourseGrid />
        </Suspense>
      </section>
    </div>
  );
}
