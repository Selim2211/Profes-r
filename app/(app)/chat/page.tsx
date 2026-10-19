import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { createClient } from "@/lib/supabase/server";

async function NewChat({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const { course } = await searchParams;
  const supabase = await createClient();
  const { data: courses } = await supabase.from("courses").select("id, name").order("name");
  const preselected = courses?.some((c) => c.id === course) ? course! : null;

  return <ChatView conversationId={null} courseId={preselected} courses={courses ?? []} initialMessages={[]} />;
}

export default function ChatPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <NewChat searchParams={searchParams} />
    </Suspense>
  );
}
