"use client";

import { ExternalLink, Sparkles } from "lucide-react";
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
  // Stay on the page and refresh it when the summary is ready (instead of opening the summary page).
  inline?: boolean;
};

// "Özet çıkar" with a level choice. Shows the job's progress and shows the summary when it is ready.
// Claim-by-claim verification is slow, so it is off unless asked for under "Gelişmiş".
export function SummaryLauncher({ target, existing, initialLevel = "standard", inline = false }: Props) {
  const router = useRouter();
  const [level, setLevel] = useState<SummaryLevel>(initialLevel);
  const [verify, setVerify] = useState(false);
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = existing[level];
  const busy = progress !== null;

  async function generate() {
    setError(null);
    setProgress({ label: "Başlıyor", value: 0 });
    try {
      const result = await runSummary({ ...target, level, verify }, (p) =>
        setProgress({ label: p.label, value: p.progress }),
      );
      if (result.step === "failed" || !result.summaryId) {
        setError(result.error ?? "Özet hazırlanamadı.");
        setProgress(null);
        return;
      }
      if (inline) {
        setProgress(null);
        router.refresh();
      } else {
        router.push(`/courses/${target.courseId}/summary/${result.summaryId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as SummaryLevel)}
          disabled={busy}
          aria-label="Özet seviyesi"
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {SUMMARY_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
              {existing[l] ? " ✓" : ""}
            </option>
          ))}
        </select>

        {current && !inline && (
          <Button
            nativeButton={false}
            render={<Link href={`/courses/${target.courseId}/summary/${current.id}`} />}
            disabled={busy}
          >
            <ExternalLink />
            Özeti aç
          </Button>
        )}
        <Button variant={current && !inline ? "outline" : "default"} onClick={generate} disabled={busy}>
          <Sparkles />
          {busy ? "Hazırlanıyor..." : current ? "Yeniden üret" : "Özet çıkar"}
        </Button>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none py-1">Gelişmiş</summary>
        <label className="flex items-start gap-2.5 pt-2">
          <input
            type="checkbox"
            checked={verify}
            onChange={(e) => setVerify(e.target.checked)}
            disabled={busy}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Her iddiayı notlara karşı doğrula. Çok daha yavaştır ve daha fazla yapay zekâ kotası harcar; kapalıyken özet
            doğrudan notlarından hazırlanır.
          </span>
        </label>
      </details>

      {progress && (
        <div className="space-y-1.5" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.value}%` }} />
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
