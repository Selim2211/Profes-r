"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { runSummary, type SummaryScopeTarget } from "@/lib/summary/client";
import { LEVEL_LABELS, SUMMARY_LEVELS, type SummaryLevel } from "@/lib/summary/template";

type Props = {
  target: SummaryScopeTarget;
  // Latest ready summary per level, if any.
  existing: Partial<Record<SummaryLevel, { id: string; version: number }>>;
  initialLevel?: SummaryLevel;
};

// "Özet çıkar" with a level choice. Shows the job's progress and opens the summary when it is ready.
export function SummaryLauncher({ target, existing, initialLevel = "standard" }: Props) {
  const router = useRouter();
  const [level, setLevel] = useState<SummaryLevel>(initialLevel);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = existing[level];
  const busy = progress !== null;

  async function generate() {
    setError(null);
    setProgress({ label: "Başlıyor", value: 0 });
    try {
      const result = await runSummary({ ...target, level }, (p) =>
        setProgress({ label: p.label, value: p.progress }),
      );
      if (result.step === "failed" || !result.summaryId) {
        setError(result.error ?? "Özet hazırlanamadı.");
        setProgress(null);
        return;
      }
      router.push(`/courses/${target.courseId}/summary/${result.summaryId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as SummaryLevel)}
          disabled={busy}
          aria-label="Özet seviyesi"
          className="h-11 rounded-lg border bg-background px-3 text-sm disabled:opacity-60"
        >
          {SUMMARY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
              {existing[l] ? " ✓" : ""}
            </option>
          ))}
        </select>

        {current && (
          <Button
            nativeButton={false}
            render={<Link href={`/courses/${target.courseId}/summary/${current.id}`} />}
            className="min-h-11"
            disabled={busy}
          >
            Özeti aç
          </Button>
        )}
        <Button variant={current ? "outline" : "default"} className="min-h-11" onClick={generate} disabled={busy}>
          {busy ? "Hazırlanıyor..." : current ? "Yeniden üret" : "Özet çıkar"}
        </Button>
      </div>

      {progress && (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.value}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.label} · %{progress.value}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
