import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatView, type ChatMessage } from "@/components/chat/chat-view";
import { createClient } from "@/lib/supabase/server";

async function Conversation({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, course_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) notFound();

  const [{ data: messages }, { data: courses }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at"),
    supabase.from("courses").select("id, name").order("name"),
  ]);

  return (
    <ChatView
      conversationId={conversation.id}
      courseId={conversation.course_id}
      courses={courses ?? []}
      initialMessages={(messages ?? []) as ChatMessage[]}
    />
  );
}

export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <Conversation params={params} />
    </Suspense>
  );
}
