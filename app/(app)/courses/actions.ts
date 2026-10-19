"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const courseSchema = z.object({
  name: z.string().trim().min(1, "Ders adı gerekli.").max(120),
  code: z.string().trim().max(30).optional(),
  description: z.string().trim().max(1000).optional(),
});

function parseCourse(formData: FormData) {
  return courseSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") || undefined,
    description: formData.get("description") || undefined,
  });
}

export type CourseState = { error?: string };

export async function createCourse(
  _prev: CourseState,
  formData: FormData,
): Promise<CourseState> {
  const parsed = parseCourse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.from("courses").insert(parsed.data).select("id").single();
  if (error || !data) return { error: "Ders oluşturulamadı." };

  revalidatePath("/courses");
  redirect(`/courses/${data.id}`);
}

export async function updateCourse(
  courseId: string,
  _prev: CourseState,
  formData: FormData,
): Promise<CourseState> {
  const parsed = parseCourse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("courses")
    .update({
      name: parsed.data.name,
      code: parsed.data.code ?? null,
      description: parsed.data.description ?? null,
    })
    .eq("id", courseId);
  if (error) return { error: "Ders güncellenemedi." };

  revalidatePath("/courses");
  redirect(`/courses/${courseId}`);
}

const weekSchema = z.object({
  weekNumber: z.coerce.number().int("Hafta numarası tam sayı olmalı.").min(1, "Hafta numarası 1 ile 52 arasında olmalı.").max(52, "Hafta numarası 1 ile 52 arasında olmalı."),
  title: z.string().trim().max(120).optional(),
});

export async function createWeek(
  courseId: string,
  _prev: CourseState,
  formData: FormData,
): Promise<CourseState> {
  const parsed = weekSchema.safeParse({
    weekNumber: formData.get("weekNumber"),
    title: formData.get("title") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("weeks").insert({
    course_id: courseId,
    week_number: parsed.data.weekNumber,
    title: parsed.data.title ?? null,
  });
  if (error) {
    return { error: error.code === "23505" ? "Bu hafta zaten var." : "Hafta oluşturulamadı." };
  }

  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}/week/${parsed.data.weekNumber}`);
}

// Removes a week with everything in it: its files (storage and rows, which cascades pages, chunks and
// jobs), topics and summaries.
export async function deleteWeek(courseId: string, week: number) {
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("course_id", courseId)
    .eq("week_number", week);
  if (docs?.length) {
    await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
    await supabase.from("documents").delete().in("id", docs.map((d) => d.id));
  }
  await Promise.all([
    supabase.from("summaries").delete().eq("course_id", courseId).eq("week_number", week),
    supabase.from("topics").delete().eq("course_id", courseId).eq("week_number", week),
  ]);
  await supabase.from("weeks").delete().eq("course_id", courseId).eq("week_number", week);
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function deleteDocument(courseId: string, week: number, documentId: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path").eq("id", documentId).maybeSingle();
  if (doc) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", documentId); // cascades pages, chunks, jobs
  }
  revalidatePath(`/courses/${courseId}/week/${week}`);
}

export async function deleteCourse(courseId: string) {
  const supabase = await createClient();
  await supabase.from("courses").delete().eq("id", courseId);
  revalidatePath("/courses");
  redirect("/courses");
}
