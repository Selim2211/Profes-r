import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

export const RECENT_MESSAGE_LIMIT = 12;

// Builds the system prompt: base rules plus what the assistant needs to know about the course(s).
export async function buildSystemPrompt(
  supabase: SupabaseClient,
  courseId: string | null,
): Promise<string> {
  const sections = [CHAT_SYSTEM_PROMPT];

  if (courseId) {
    const [{ data: course }, { data: weeks }] = await Promise.all([
      supabase.from("courses").select("name, code").eq("id", courseId).maybeSingle(),
      supabase.from("weeks").select("week_number, title").eq("course_id", courseId).order("week_number"),
    ]);
    if (course) {
      const weekList = (weeks ?? []).map((w) => `- Hafta ${w.week_number}: ${w.title ?? "(başlıksız)"}`).join("\n");
      sections.push(
        `Aktif ders: ${course.name}${course.code ? ` (${course.code})` : ""}\nHaftalar:\n${weekList || "(henüz hafta yok)"}`,
      );
    }
  } else {
    const { data: courses } = await supabase.from("courses").select("id, name").order("name");
    if (courses?.length) {
      sections.push(
        "Sohbet belirli bir derse bağlı değil. Öğrencinin dersleri (search_notes için courseId):\n" +
          courses.map((c) => `- ${c.name}: ${c.id}`).join("\n"),
      );
    }
  }

  return sections.join("\n\n");
}

// The model only sees the most recent messages; older ones are dropped (summaries arrive in a later phase).
export async function loadRecentMessages(supabase: SupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(RECENT_MESSAGE_LIMIT);
  if (error) throw new Error(error.message);

  return (data ?? []).reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));
}
