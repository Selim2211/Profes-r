"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/chat/markdown";
import { SourcePanel, type SourceInfo } from "@/components/chat/source-panel";

type Props = {
  courseId: string;
  week: number;
  summary: string | null;
  topics: { name: string; description: string | null }[];
};

export function WeekView({ courseId, week, summary, topics }: Props) {
  const [mode, setMode] = useState<"summary" | "detail">("summary");
  const [lecture, setLecture] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ info: SourceInfo | null; loading: boolean; error: string | null } | null>(null);

  async function explain() {
    setMode("detail");
    if (busy) return;
    setBusy(true);
    setError(null);
    setLecture("");
    try {
      const response = await fetch("/api/week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, week }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Anlatım alınamadı.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setLecture((prev) => prev + chunk);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  async function openSource(citedWeek: number | null, page: number) {
    setSource({ info: null, loading: true, error: null });
    const params = new URLSearchParams({ courseId, page: String(page) });
    if (citedWeek !== null) params.set("week", String(citedWeek));
    try {
      const response = await fetch(`/api/sources?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Kaynak açılamadı.");
      setSource({ info: body, loading: false, error: null });
    } catch (e) {
      setSource({ info: null, loading: false, error: e instanceof Error ? e.message : "Kaynak açılamadı." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={mode === "summary" ? "default" : "outline"} className="min-h-11" onClick={() => setMode("summary")}>
          Kısa özet
        </Button>
        <Button
          variant={mode === "detail" ? "default" : "outline"}
          className="min-h-11"
          onClick={explain}
          disabled={busy}
        >
          {busy ? "Anlatılıyor..." : lecture ? "Yeniden anlat" : "Detaylı anlat"}
        </Button>
      </div>

      {mode === "summary" && (
        <div className="space-y-4">
          {summary ? (
            <Markdown content={summary} />
          ) : (
            <p className="text-sm text-muted-foreground">Bu hafta için özet henüz hazırlanmadı.</p>
          )}
          {topics.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold">Konular</h2>
              <ul className="space-y-1 text-sm">
                {topics.map((t) => (
                  <li key={t.name}>
                    <span className="font-medium">{t.name}</span>
                    {t.description && <span className="text-muted-foreground"> · {t.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === "detail" && (
        <div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!lecture && busy && <p className="text-sm text-muted-foreground">Notlara bakıyorum...</p>}
          {lecture && <Markdown content={lecture} onCitationClick={openSource} />}
        </div>
      )}

      <SourcePanel
        source={source?.info ?? null}
        loading={source?.loading ?? false}
        error={source?.error ?? null}
        onClose={() => setSource(null)}
      />
    </div>
  );
}
