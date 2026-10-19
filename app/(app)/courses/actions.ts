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
  const { error } = await supabase.from("courses").insert(parsed.data);
  if (error) return { error: "Ders oluşturulamadı." };

  revalidatePath("/courses");
  redirect("/courses");
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

export async function deleteCourse(courseId: string) {
  const supabase = await createClient();
  await supabase.from("courses").delete().eq("id", courseId);
  revalidatePath("/courses");
  redirect("/courses");
}
