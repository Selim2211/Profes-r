export type IngestProgress = {
  stage: string;
  progress: number;
  error: string | null;
};

export const STAGE_LABELS: Record<string, string> = {
  extract: "Metin çıkarılıyor",
  chunk: "Parçalanıyor",
  embed: "Vektörler hesaplanıyor",
  summarize: "Özet hazırlanıyor",
  done: "Hazır",
  failed: "Başarısız",
};

// Browser-side driver: starts the job and keeps calling the slice endpoint until done or failed.
export async function runIngest(
  documentId: string,
  onProgress: (progress: IngestProgress) => void,
): Promise<IngestProgress> {
  const start = await fetch("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  const started = await start.json();
  if (!start.ok) throw new Error(started.error ?? "İşleme başlatılamadı.");

  for (;;) {
    const response = await fetch(`/api/ingest/${started.jobId}`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "İşleme sırasında hata oluştu.");

    const progress: IngestProgress = { stage: body.stage, progress: body.progress, error: body.error };
    onProgress(progress);
    if (progress.stage === "done" || progress.stage === "failed") return progress;
  }
}
