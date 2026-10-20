import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

async function ConversationList() {
  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);

  return (
    <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
      <li>
        <Link href="/chat" className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-muted">
          + Yeni sohbet
        </Link>
      </li>
      {(conversations ?? []).map((c) => (
        <li key={c.id}>
          <Link href={`/chat/${c.id}`} className="flex min-h-11 items-center truncate rounded-md px-3 text-sm hover:bg-muted">
            {c.title || "Başlıksız sohbet"}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <details className="rounded-xl bg-card px-3 py-1 ring-1 ring-border">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Sohbet geçmişi</summary>
        <Suspense fallback={<p className="py-2 text-sm text-muted-foreground">Yükleniyor...</p>}>
          <ConversationList />
        </Suspense>
      </details>
      {children}
    </div>
  );
}
