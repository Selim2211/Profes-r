"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SourceInfo = {
  title: string;
  week: number | null;
  pageStart: number;
  pageEnd: number;
  heading: string | null;
  content: string;
  fileUrl: string | null;
};

type Props = {
  source: SourceInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

export function SourcePanel({ source, loading, error, onClose }: Props) {
  if (!source && !loading && !error) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-14 z-20 max-h-[60dvh] overflow-y-auto rounded-t-xl border bg-background p-4 shadow-lg md:bottom-0 md:left-56"
      role="dialog"
      aria-label="Kaynak"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{source?.title ?? "Kaynak"}</p>
            {source && (
              <p className="text-xs text-muted-foreground">
                {source.week === null ? "Haftaya bağlı değil" : `${source.week}. Hafta`} · sayfa{" "}
                {source.pageStart === source.pageEnd ? source.pageStart : `${source.pageStart}-${source.pageEnd}`}
                {source.heading ? ` · ${source.heading}` : ""}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={onClose} aria-label="Kapat">
            <X className="size-4" />
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {source && (
          <>
            <p className="whitespace-pre-wrap text-sm leading-6">{source.content}</p>
            {source.fileUrl && (
              <Button
                nativeButton={false}
                render={<a href={source.fileUrl} target="_blank" rel="noreferrer" />}
                className="min-h-11"
              >
                PDF&apos;te aç
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
