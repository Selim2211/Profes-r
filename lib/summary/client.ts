import { STEP_LABELS, type SummaryStep } from "./jobs";
import type { SummaryLevel } from "./template";

export type SummaryProgress = {
  step: SummaryStep;
  label: string;
  progress: number;
  error: string | null;
  summaryId: string | null;
};

export type SummaryTarget = { courseId: string; level: SummaryLevel } & (
  | { scope: "document"; documentId: string }
  | { scope: "week"; weekNumber: number }
);

// Browser-side driver: starts (or resumes) the job and keeps calling the slice endpoint until it is
// done or failed, reporting progress after every slice.
export async function runSummary(
  target: SummaryTarget,
  onProgress: (progress: SummaryProgress) => void,
): Promise<SummaryProgress> {
  const start = await fetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
  });
  const started = await start.json();
  if (!start.ok) throw new Error(started.error ?? "Özet başlatılamadı.");

  for (;;) {
    const response = await fetch(`/api/summary/${started.jobId}`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Özet hazırlanırken hata oluştu.");

    const progress: SummaryProgress = {
      step: body.step,
      label: STEP_LABELS[body.step as SummaryStep] ?? body.step,
      progress: body.progress,
      error: body.error,
      summaryId: body.summaryId,
    };
    onProgress(progress);
    if (progress.step === "done" || progress.step === "failed") return progress;
  }
}
