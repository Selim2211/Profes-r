import type { Verdict } from "./claims";
import type { OutlineEntry } from "./sections";
import type { SummaryLevel } from "./template";

export type SummaryStep = "transcribe" | "section" | "map" | "reduce" | "coverage" | "verify" | "done" | "failed";

// The steps in order; "failed" is a terminal state that remembers where it stopped.
export const STEP_ORDER: Exclude<SummaryStep, "failed">[] = ["transcribe", "section", "map", "reduce", "coverage", "verify", "done"];

export const STEP_LABELS: Record<SummaryStep, string> = {
  transcribe: "Sayfalar kontrol ediliyor",
  section: "Bölümlere ayrılıyor",
  map: "Bölümler okunuyor",
  reduce: "Özet yazılıyor",
  coverage: "Kapsam kontrol ediliyor",
  verify: "Doğrulanıyor",
  done: "Hazır",
  failed: "Başarısız",
};

// Share of the progress bar each step covers (percent range [from, to)).
const RANGES: Record<Exclude<SummaryStep, "failed">, [number, number]> = {
  transcribe: [0, 10],
  section: [10, 15],
  map: [15, 55],
  reduce: [55, 70],
  coverage: [70, 82],
  verify: [82, 100],
  done: [100, 100],
};

// Progress percent while `fraction` (0..1) of a step is done.
export function stepProgress(step: Exclude<SummaryStep, "failed">, fraction: number): number {
  const [from, to] = RANGES[step];
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.floor(from + (to - from) * clamped);
}

// Resume state per step, stored in summary_jobs.cursor.
export type JobCursor = {
  // transcribe
  changedDocuments?: string[];
  ingestJobs?: { documentId: string; jobId: string }[];
  // section: the stored outline of each document (null = heading-based), in scope order
  documents?: { documentId: string; outline: OutlineEntry[] | null; sections: number }[];
  // map
  docIndex?: number;
  sectionIndex?: number;
  // verify
  verified?: number;
  verdicts?: Verdict[];
};

export type SummaryJob = {
  id: string;
  user_id: string;
  course_id: string;
  scope: "document" | "week";
  document_id: string | null;
  week_number: number | null;
  level: SummaryLevel;
  // false: skip the claim-by-claim verification (cheaper); the summary is then marked as unverified.
  verify: boolean;
  step: SummaryStep;
  progress: number;
  cursor: JobCursor;
  error: string | null;
  failed_step: SummaryStep | null;
  summary_id: string | null;
};

export type SummaryJobView = {
  step: SummaryStep;
  progress: number;
  error: string | null;
  summaryId: string | null;
};
