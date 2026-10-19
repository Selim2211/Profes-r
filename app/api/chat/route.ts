import { isStepCount, streamText } from "ai";
import { z } from "zod";
import { runGuarded } from "@/lib/ai/guard";
import { chatModel } from "@/lib/ai/models";
import { createTools, type ToolContext } from "@/lib/ai/tools";
import { extractCitationRefs } from "@/lib/rag/citations";
import { buildSystemPrompt, loadRecentMessages } from "@/lib/rag/context";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_AGENT_STEPS = 5;

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  courseId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Giriş gerekli." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Geçersiz istek." }, { status: 400 });
  const { message } = parsed.data;
  const userId = auth.user.id;

  return runGuarded(supabase, userId, "chat", { chatRate: true }, async () => {
  // Resolve (or create) the conversation. RLS guarantees it belongs to the user.
  let conversationId = parsed.data.conversationId;
  let courseId: string | null = parsed.data.courseId ?? null;

  if (conversationId) {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id, course_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!existing) return Response.json({ error: "Sohbet bulunamadı." }, { status: 404 });
    courseId = existing.course_id;
  } else {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ course_id: courseId, title: message.slice(0, 60) })
      .select("id")
      .single();
    if (error || !created) return Response.json({ error: "Sohbet oluşturulamadı." }, { status: 500 });
    conversationId = created.id;
  }

  const { error: saveError } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, role: "user", content: message });
  if (saveError) return Response.json({ error: "Mesaj kaydedilemedi." }, { status: 500 });

  const [system, history] = await Promise.all([
    buildSystemPrompt(supabase, courseId),
    loadRecentMessages(supabase, conversationId!),
  ]);

  const toolContext: ToolContext = { supabase, courseId, citations: new Map() };

  const result = streamText({
    model: chatModel(),
    system,
    messages: history,
    tools: createTools(toolContext),
    stopWhen: isStepCount(MAX_AGENT_STEPS),
    onFinish: async ({ text }) => {
      // Keep only the sources the answer actually cites.
      const cited = extractCitationRefs(text);
      const citations = [...toolContext.citations.values()]
        .filter((c) =>
          cited.some((ref) => ref.week === c.week && ref.page >= c.pageStart && ref.page <= c.pageEnd),
        )
        .map(({ chunk_id, document_id, week, page }) => ({ chunk_id, document_id, week, page }));

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: text || "Cevap üretilemedi, lütfen tekrar dene.",
        citations,
      });
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },
  });

  return result.toTextStreamResponse({
    headers: { "X-Conversation-Id": conversationId! },
  });
  });
}
