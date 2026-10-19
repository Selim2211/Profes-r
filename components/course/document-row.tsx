"use client";

import { AlertCircle, CheckCircle2, FileText, Loader2, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useIsIngesting } from "@/lib/ingest/active";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(options: { reprocess?: boolean; transcribeAll?: boolean } = {}) {
    setMenuOpen(false);
    setLocalError(null);
    setProgress({ label: "Başlıyor", value: 0 });
    try {
      const result = await runIngest(
        id,
        (p) => setProgress({ label: STAGE_LABELS[p.stage] ?? p.stage, value: p.progress }),
        options,
      );
      if (result.stage === "failed") setLocalError(result.error);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
    setProgress(null);
    router.refresh();
  }

  const shownError = localError ?? (status === "failed" ? error : null);
  const ingestingElsewhere = useIsIngesting(id); // the uploader above is working on this file
  const canRun = (status === "failed" || status === "pending" || status === "processing") && !ingestingElsewhere;

  return (
    <li className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {progress ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {progress.label} · %{progress.value}
              </>
            ) : status === "ready" ? (
              <>
                <CheckCircle2 className="size-3 text-success" />
                {STATUS_LABELS[status]}
                {pageCount ? ` · ${pageCount} sayfa` : ""}
              </>
            ) : status === "failed" ? (
              <>
                <AlertCircle className="size-3 text-destructive" />
                {STATUS_LABELS[status]}
              </>
            ) : ingestingElsewhere ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                İşleniyor
              </>
            ) : (
              STATUS_LABELS[status]
            )}
          </p>
        </div>
        {canRun && !progress && (
          <Button size="sm" variant="outline" onClick={() => run()}>
            {status === "failed" ? "Tekrar dene" : "Devam et"}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-10"
          aria-label="Dosya seçenekleri"
          onClick={() => setMenuOpen(true)}
          disabled={progress !== null}
        >
          <MoreHorizontal />
        </Button>
      </div>
      {progress && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="status">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.value}%` }} />
        </div>
      )}
      {shownError && !progress && <p className="mt-2 text-sm text-destructive">{shownError}</p>}

      <Modal
        open={menuOpen}
        onOpenChange={(value) => {
          setMenuOpen(value);
          if (!value) setConfirmDelete(false);
        }}
        title={title}
        description="Bu dosyayla ne yapmak istersin?"
      >
        {confirmDelete ? (
          <form action={deleteAction} className="space-y-3">
            <p className="text-sm text-muted-foreground">Dosya ve ondan çıkarılan metin silinecek. Hafta özeti kalır, istersen yeniden üretirsin.</p>
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" className="flex-1">
                Evet, sil
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Vazgeç
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            {status === "ready" && (
              <>
                <Button variant="outline" className="h-12 w-full justify-start" onClick={() => run({ reprocess: true })}>
                  Yeniden işle
                </Button>
                <Button
                  variant="outline"
                  className="h-auto w-full flex-col items-start gap-0.5 py-2.5"
                  onClick={() => run({ reprocess: true, transcribeAll: true })}
                >
                  Görselle aktar
                  <span className="text-xs font-normal text-muted-foreground">Formül, tablo veya şemalı PDF&apos;ler için; daha yavaştır.</span>
                </Button>
              </>
            )}
            <Button variant="destructive" className="h-12 w-full justify-start" onClick={() => setConfirmDelete(true)}>
              Dosyayı sil
            </Button>
          </div>
        )}
      </Modal>
    </li>
  );
}
