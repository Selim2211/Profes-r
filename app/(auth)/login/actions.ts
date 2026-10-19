"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

const credentialsSchema = z.object({
  email: z.string().email("Geçerli bir e-posta gir."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
});

function parse(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "E-posta veya şifre hatalı." };

  redirect("/");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!isAllowedEmail(parsed.data.email)) {
    return { error: "Bu e-posta adresi için kayıt izni yok." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) return { error: "Kayıt oluşturulamadı: " + error.message };

  if (data.session) redirect("/");
  return { message: "Kayıt oluşturuldu. E-postana gelen bağlantıyla hesabını onayla." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
