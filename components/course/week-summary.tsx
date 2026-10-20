"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import { SourcePanel, type SourceInfo } from "@/components/chat/source-panel";
import { SummaryLauncher } from "@/components/summary/summary-launcher";
import { cn } from "@/lib/utils";
import { LEVEL_LABELS, SUMMARY_LEVELS, type SummaryLevel } from "@/lib/summary/template";

export type SavedLevelSummary = { id: string; level: SummaryLevel; version: number; contentMd: string };

type Props = {
  courseId: string;
  week: number;
  // Latest saved summary per level, as stored in the database.
  summaries: SavedLevelSummary[];
  // The short overview made while the notes were processed; shown until a full summary exists.
  quickSummary: string | null;
  topics: { name: string; description: string | null }[];
  hasNotes: boolean;
};

// The week's summary, read straight from the database: nothing is generated when the page opens.
export function WeekSummary({ courseId, week, summaries, quickSummary, topics, hasNotes }: Props) {
  const available = SUMMARY_LEVELS.filter((l) => summaries.some((s) => s.level === l));
  const [level, setLevel] = useState<SummaryLevel>(available.includes("standard") ? "standard" : (available[0] ?? "standard"));
  const [source, setSource] = useState<{ info: SourceInfo | null; loading: boolean; error: string | null } | null>(null);

  const current = summaries.find((s) => s.level === level) ?? summaries[0] ?? null;
  const existing = Object.fromEntries(summaries.map((s) => [s.level, { id: s.id, version: s.version }])) as Partial<
    Record<SummaryLevel, { id: string; version: number }>
  >;

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
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Hafta özeti</h2>
        {current && (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-1" role="tablist" aria-label="Özet seviyesi">
              {available.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={level === l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "h-8 cursor-pointer rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors",
                    level === l && "bg-card text-foreground shadow-xs",
                  )}
                >
                  {LEVEL_LABELS[l]}
                </button>
              ))}
            </div>
            <Link
              href={`/courses/${courseId}/summary/${current.id}`}
              aria-label="Tam sayfada aç, düzenle veya indir"
              title="Tam sayfada aç, düzenle veya indir"
              className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </Link>
          </div>
        )}
      </div>

      {current ? (
        <article className="rounded-2xl bg-card p-5 ring-1 ring-border md:p-10">
          <Markdown reading content={current.contentMd} onCitationClick={openSource} />
        </article>
      ) : quickSummary ? (
        <article className="rounded-2xl bg-card p-5 ring-1 ring-border md:p-10">
          <p className="mb-3 inline-flex rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">Hızlı özet</p>
          <Markdown reading content={quickSummary} />
        </article>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card px-6 py-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="size-6" />
          </span>
          <p className="font-heading text-xl font-semibold">{hasNotes ? "Özet henüz çıkarılmadı" : "Önce bu haftaya not ekle"}</p>
          <p className="text-sm text-muted-foreground">
            {hasNotes ? "Aşağıdan seviyeyi seçip özet çıkar." : "Dosyaları yukarıdaki alana sürükleyince özet otomatik hazırlanır."}
          </p>
        </div>
      )}

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <span
              key={t.name}
              title={t.description ?? undefined}
              className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      {hasNotes && (
        <div className="rounded-xl bg-card p-4 ring-1 ring-border">
          <p className="mb-3 text-sm font-medium">{current ? "Yeniden üret veya başka seviye çıkar" : "Özet çıkar"}</p>
          <SummaryLauncher key={summaries.map((s) => s.id).join()} target={{ scope: "week", courseId, weekNumber: week }} existing={existing} initialLevel={level} inline />
        </div>
      )}

      <SourcePanel
        source={source?.info ?? null}
        loading={source?.loading ?? false}
        error={source?.error ?? null}
        onClose={() => setSource(null)}
      />
    </section>
  );
}
