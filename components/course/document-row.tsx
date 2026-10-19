"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { STAGE_LABELS, runIngest } from "@/lib/ingest/client";

type Props = {
  id: string;
  title: string;
  status: "pending" | "processing" | "ready" | "failed";
  error: string | null;
  pageCount: number | null;
  deleteAction: () => Promise<void>;
};

const STATUS_LABELS = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  ready: "Hazır",
  failed: "Başarısız",
} as const;

export function DocumentRow({ id, title, status, error, pageCount, deleteAction }: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function retry() {
    setLocalError(null);
    setProgress({ label: "Başlıyor", value: 0 });
    try {
      const result = await runIngest(id, (p) =>
        setProgress({ label: STAGE_LABELS[p.stage] ?? p.stage, value: p.progress }),
      );
      if (result.stage === "failed") setLocalError(result.error);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
    setProgress(null);
    router.refresh();
  }

  const shownError = localError ?? (status === "failed" ? error : null);
  const canRun = status === "failed" || status === "pending" || status === "processing";

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {STATUS_LABELS[status]}
            {pageCount ? ` · ${pageCount} sayfa` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canRun && (
            <Button size="sm" variant="outline" className="min-h-11" onClick={retry} disabled={progress !== null}>
              {status === "failed" ? "Tekrar dene" : "Devam et"}
            </Button>
          )}
          <form action={deleteAction}>
            <Button type="submit" size="sm" variant="destructive" className="min-h-11" disabled={progress !== null}>
              Sil
            </Button>
          </form>
        </div>
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
      {shownError && !progress && <p className="text-sm text-destructive">{shownError}</p>}
    </li>
  );
}
