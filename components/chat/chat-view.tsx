"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "./markdown";
import { SourcePanel, type SourceInfo } from "./source-panel";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
export type CourseOption = { id: string; name: string };

type Props = {
  conversationId: string | null;
  courseId: string | null;
  courses: CourseOption[];
  initialMessages: ChatMessage[];
};

export function ChatView({ conversationId: initialConversationId, courseId: initialCourseId, courses, initialMessages }: Props) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [courseId, setCourseId] = useState<string>(initialCourseId ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ info: SourceInfo | null; loading: boolean; error: string | null } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          courseId: courseId || null,
          message: text,
        }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Cevap alınamadı.");
      }

      const newId = response.headers.get("X-Conversation-Id");
      if (newId && !conversationId) {
        setConversationId(newId);
        window.history.replaceState(null, "", `/chat/${newId}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m)),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
    } finally {
      setBusy(false);
    }
  }

  async function openSource(week: number | null, page: number) {
    if (!conversationId) return;
    setSource({ info: null, loading: true, error: null });
    const params = new URLSearchParams({ conversationId, page: String(page) });
    if (week !== null) params.set("week", String(week));
    try {
      const response = await fetch(`/api/sources?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Kaynak açılamadı.");
      setSource({ info: body, loading: false, error: null });
    } catch (e) {
      setSource({ info: null, loading: false, error: e instanceof Error ? e.message : "Kaynak açılamadı." });
    }
  }

  const locked = Boolean(conversationId);

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col md:min-h-[calc(100dvh-8rem)]">
      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="course" className="text-sm text-muted-foreground">
          Ders
        </label>
        <select
          id="course"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={locked}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm disabled:opacity-60"
        >
          <option value="">Tüm dersler</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Notların hakkında bir soru sor. Cevapları yalnızca yüklediğin notlara dayandırırım.
          </p>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="max-w-full rounded-2xl rounded-bl-md bg-card px-4 py-3 ring-1 ring-border">
              {m.content ? (
                <Markdown content={m.content} onCitationClick={openSource} />
              ) : (
                <p className="text-sm text-muted-foreground">Notlara bakıyorum...</p>
              )}
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="pb-2 text-sm text-destructive">{error}</p>}

      <form onSubmit={send} className="sticky bottom-16 flex items-end gap-2 bg-background pb-2 md:bottom-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Bir soru yaz..."
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={busy || !input.trim()} aria-label="Gönder">
          <Send className="size-4" />
        </Button>
      </form>

      <SourcePanel
        source={source?.info ?? null}
        loading={source?.loading ?? false}
        error={source?.error ?? null}
        onClose={() => setSource(null)}
      />
    </div>
  );
}
