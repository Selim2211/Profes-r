import { Suspense } from "react";
import { CourseGrid } from "@/components/course/course-grid";
import { NewCourseButton } from "@/components/course/new-course-button";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-indigo-500/20 md:p-8">
        <div className="absolute -top-10 -right-10 size-48 rounded-full bg-white/10 blur-2xl" />
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Merhaba 👋</h1>
        <p className="mt-2 max-w-md text-sm text-white/85 md:text-base">
          Dersini seç, haftaya notlarını yükle; özetini bir kere çıkarırız, istediğin zaman açıp okursun.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Derslerim</h2>
          <NewCourseButton />
        </div>
        <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl bg-muted" />}>
          <CourseGrid />
        </Suspense>
      </section>
    </div>
  );
}
