"use client";

import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { markIngesting } from "@/lib/ingest/active";
import { STAGE_LABELS, runIngest } from "@/lib/ingest/client";
import { runSummary } from "@/lib/summary/client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 50 * 1024 * 1024;
const EXTENSIONS = ["pdf", "txt", "md"];
// Files are uploaded to storage all at once (cheap); the model-heavy processing runs a few at a time.
const INGEST_CONCURRENCY = 2;

type Item = {
  id: string;
  name: string;
  phase: "uploading" | "waiting" | "processing" | "done" | "error";
  progress: number;
  label: string;
  error?: string;
};

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  });
  await Promise.all(workers);
}

export function WeekUploader({ courseId, week }: { courseId: string; week: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<{ label: string; value: number } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // handleFiles can run several times at once (more files dropped while others are processing); the
  // week summary is made once, when the last batch is finished.
  const activeBatches = useRef(0);
  const uploadedCount = useRef(0);

  const patch = (id: string, change: Partial<Item>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)));

  async function uploadOne(supabase: ReturnType<typeof createClient>, userId: string, file: File, item: Item) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const documentId = crypto.randomUUID();
    const storagePath = `${userId}/${courseId}/${documentId}.${extension}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file);
    if (uploadError) {
      patch(item.id, { phase: "error", error: "Dosya yüklenemedi: " + uploadError.message });
      return null;
    }
    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      course_id: courseId,
      week_number: week,
      title: file.name.replace(/\.[^.]+$/, ""),
      storage_path: storagePath,
    });
    if (insertError) {
      await supabase.storage.from("documents").remove([storagePath]);
      patch(item.id, { phase: "error", error: "Dosya kaydedilemedi: " + insertError.message });
      return null;
    }
    patch(item.id, { phase: "waiting", label: "Sırada" });
    return documentId;
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = [...fileList];
    if (files.length === 0) return;
    activeBatches.current++;
    setSummaryError(null);

    const entries = files.map((file) => ({
      file,
      item: { id: crypto.randomUUID(), name: file.name, phase: "uploading", progress: 0, label: "Yükleniyor" } as Item,
    }));
    const rejected: Item[] = [];
    const accepted = entries.filter(({ file, item }) => {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const problem = !EXTENSIONS.includes(extension)
        ? "Yalnızca PDF, TXT veya MD yüklenebilir."
        : file.size > MAX_BYTES
          ? "Dosya 50 MB'tan büyük."
          : file.size === 0
            ? "Dosya boş."
            : null;
      if (problem) rejected.push({ ...item, phase: "error", error: problem });
      return !problem;
    });
    setItems((prev) => [...prev, ...rejected, ...accepted.map((a) => a.item)]);

    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Oturum bulunamadı, tekrar giriş yap.");
      const userId = auth.user.id;

      const ids = await Promise.all(accepted.map(({ file, item }) => uploadOne(supabase, userId, file, item)));
      router.refresh(); // the files already show up in the list below

      const jobs = accepted.flatMap(({ item }, index) => {
        const documentId = ids[index];
        if (!documentId) return [];
        return [
          async () => {
            patch(item.id, { phase: "processing", label: "Başlıyor", progress: 0 });
            markIngesting(documentId, true);
            try {
              const result = await runIngest(documentId, (p) =>
                patch(item.id, { label: STAGE_LABELS[p.stage] ?? p.stage, progress: p.progress }),
              );
              if (result.stage === "failed") throw new Error(result.error ?? "İşleme başarısız oldu.");
              uploadedCount.current++;
              patch(item.id, { phase: "done", label: "Hazır", progress: 100 });
            } catch (e) {
              patch(item.id, { phase: "error", error: e instanceof Error ? e.message : "İşleme başarısız oldu." });
            } finally {
              markIngesting(documentId, false);
            }
          },
        ];
      });
      await runPool(jobs, INGEST_CONCURRENCY);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bir hata oluştu.";
      setItems((prev) => prev.map((i) => (i.phase === "uploading" ? { ...i, phase: "error", error: message } : i)));
    } finally {
      activeBatches.current--;
    }

    if (activeBatches.current > 0) return;
    router.refresh();

    // The week's summary is made once from all the notes and then stays in the database.
    if (uploadedCount.current > 0) {
      uploadedCount.current = 0;
      setSummary({ label: "Özet hazırlanıyor", value: 0 });
      try {
        const result = await runSummary({ scope: "week", courseId, weekNumber: week, level: "standard", verify: false }, (p) =>
          setSummary({ label: p.label, value: p.progress }),
        );
        if (result.step === "failed") setSummaryError(result.error ?? "Özet hazırlanamadı.");
      } catch (e) {
        setSummaryError(e instanceof Error ? e.message : "Özet hazırlanamadı.");
      }
      setSummary(null);
      router.refresh();
    }
    setItems((prev) => prev.filter((i) => i.phase === "error"));
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 hover:border-primary/50 hover:bg-accent/50",
          dragging && "border-primary bg-accent",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <UploadCloud className="size-6" />
        </span>
        <span className="font-semibold">{dragging ? "Bırak, yüklensin" : "Dosyaları buraya sürükle"}</span>
        <span className="text-sm text-muted-foreground">
          ya da <span className="font-medium text-primary underline underline-offset-4">dosya seç</span> · birden fazla PDF, TXT veya MD · en fazla 50 MB
        </span>
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.md"
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files ?? []);
            e.target.value = ""; // the same file can be chosen again
          }}
        />
      </label>

      {items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-card p-3 ring-1 ring-border">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  {item.phase === "error" ? (
                    <p className="text-xs text-destructive">{item.error}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {item.label}
                      {item.phase === "processing" ? ` · %${item.progress}` : ""}
                    </p>
                  )}
                </div>
                {item.phase === "done" ? (
                  <CheckCircle2 className="size-5 shrink-0 text-success" />
                ) : item.phase === "error" ? (
                  <AlertCircle className="size-5 shrink-0 text-destructive" />
                ) : (
                  <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                )}
              </div>
              {item.phase === "processing" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <div className="rounded-xl bg-accent p-3 ring-1 ring-border" role="status">
          <p className="text-sm font-medium text-accent-foreground">
            {summary.label} · %{summary.value}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary.value}%` }} />
          </div>
        </div>
      )}
      {summaryError && (
        <p className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
          Notlar yüklendi ama özet çıkarılamadı: {summaryError} Aşağıdan &quot;Özet çıkar&quot; ile tekrar deneyebilirsin.
        </p>
      )}
    </div>
  );
}
