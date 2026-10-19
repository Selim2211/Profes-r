"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_LABELS, runIngest } from "@/lib/ingest/client";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 50 * 1024 * 1024;
const EXTENSIONS = ["pdf", "txt", "md"];

export function UploadForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ label: string; progress: number } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const weekRaw = String(form.get("week") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();

    if (!(file instanceof File) || file.size === 0) return setError("Bir dosya seç.");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONS.includes(extension)) return setError("Yalnızca PDF, TXT veya MD dosyaları yüklenebilir.");
    if (file.size > MAX_BYTES) return setError("Dosya 50 MB'tan büyük olamaz.");

    const week = weekRaw === "" ? null : Number(weekRaw);
    if (week !== null && (!Number.isInteger(week) || week < 1 || week > 52)) {
      return setError("Hafta numarası 1 ile 52 arasında olmalı.");
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Oturum bulunamadı, tekrar giriş yap.");

      const documentId = crypto.randomUUID();
      const storagePath = `${auth.user.id}/${courseId}/${documentId}.${extension}`;

      setStatus({ label: "Dosya yükleniyor", progress: 0 });
      const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file);
      if (uploadError) throw new Error("Dosya yüklenemedi: " + uploadError.message);

      const { error: insertError } = await supabase.from("documents").insert({
        id: documentId,
        course_id: courseId,
        week_number: week,
        title: title || file.name.replace(/\.[^.]+$/, ""),
        storage_path: storagePath,
      });
      if (insertError) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw new Error("Doküman kaydedilemedi: " + insertError.message);
      }

      const result = await runIngest(documentId, (p) =>
        setStatus({ label: STAGE_LABELS[p.stage] ?? p.stage, progress: p.progress }),
      );
      if (result.stage === "failed") throw new Error(result.error ?? "İşleme başarısız oldu.");

      router.push(`/courses/${courseId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="file">Dosya (PDF, TXT, MD · en fazla 50 MB)</Label>
        <Input id="file" name="file" type="file" accept=".pdf,.txt,.md" required disabled={busy} className="h-11" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="week">Hafta numarası (opsiyonel)</Label>
          <Input id="week" name="week" type="number" min={1} max={52} inputMode="numeric" disabled={busy} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Başlık (opsiyonel)</Label>
          <Input id="title" name="title" disabled={busy} className="h-11" />
        </div>
      </div>

      {status && (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${status.progress}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {status.label} · %{status.progress}
          </p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="h-11" disabled={busy}>
        {busy ? "İşleniyor..." : "Yükle ve işle"}
      </Button>
    </form>
  );
}
