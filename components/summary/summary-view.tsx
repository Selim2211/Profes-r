"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveEditedSummary } from "@/app/(app)/courses/[courseId]/summary/actions";
import { Markdown } from "@/components/chat/markdown";
import { SourcePanel, type SourceInfo } from "@/components/chat/source-panel";
import { SummaryLauncher } from "@/components/summary/summary-launcher";
import { Button } from "@/components/ui/button";
import { LEVEL_LABELS, type SummaryLevel } from "@/lib/summary/template";

type CoverageReport = {
  total: number;
  coveredBefore: number;
  coveredAfter: number;
  coverage: number;
  missing: { kind: string; label: string }[];
  rounds: number;
};

type VerificationReport = {
  claims: number;
  supported: number;
  autoVerified?: number;
  rewritten: number;
  removed: number;
  changes: { status: "rewritten" | "removed"; before: string; after?: string; reason?: string }[];
};

export type SummaryData = {
  id: string;
  contentMd: string;
  level: SummaryLevel;
  version: number;
  status: string;
  coverage: number | null;
  verification: {
    coverage?: CoverageReport;
    verification?: VerificationReport;
    edited?: boolean;
    unverified?: boolean;
  } | null;
  createdAt: string;
  weekNumber: number | null;
  documentId: string | null;
  scope: "document" | "week";
};

type Props = {
  courseId: string;
  title: string;
  summary: SummaryData;
  versions: { id: string; version: number; createdAt: string; status: string }[];
  levels: Partial<Record<SummaryLevel, { id: string; version: number }>>;
};

const date = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });

const slug = (text: string) =>
  text.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9ğüşıöç]+/gi, "-").replace(/^-+|-+$/g, "") || "ozet";

// The quiz answers are written as [[CEVAP: ...]] for the collapsible UI; in a file they read as plain text.
export function toExportMarkdown(title: string, level: SummaryLevel, markdown: string): string {
  const body = markdown.replace(/\[\[CEVAP:\s*([\s\S]*?)\]\]/g, "**Cevap:** $1");
  return `# ${title} — ${LEVEL_LABELS[level]} özet\n\n${body}\n`;
}

export function SummaryView({ courseId, title, summary, versions, levels }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(summary.contentMd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [source, setSource] = useState<{ info: SourceInfo | null; loading: boolean; error: string | null } | null>(null);

  const coverage = summary.verification?.coverage;
  const check = summary.verification?.verification;
  const target =
    summary.scope === "week"
      ? ({ scope: "week", courseId, weekNumber: summary.weekNumber! } as const)
      : ({ scope: "document", courseId, documentId: summary.documentId! } as const);

  async function openSource(week: number | null, page: number) {
    setSource({ info: null, loading: true, error: null });
    const params = new URLSearchParams({ courseId, page: String(page) });
    if (week !== null) params.set("week", String(week));
    if (summary.scope === "document" && summary.documentId) params.set("documentId", summary.documentId);
    try {
      const response = await fetch(`/api/sources?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Kaynak açılamadı.");
      setSource({ info: body, loading: false, error: null });
    } catch (e) {
      setSource({ info: null, loading: false, error: e instanceof Error ? e.message : "Kaynak açılamadı." });
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveEditedSummary(summary.id, draft);
    setSaving(false);
    if (result.error || !result.id) return setError(result.error ?? "Kaydedilemedi.");
    setEditing(false);
    router.push(`/courses/${courseId}/summary/${result.id}`);
  }

  function download() {
    const blob = new Blob([toExportMarkdown(title, summary.level, summary.contentMd)], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slug(title)}-${summary.level}-v${summary.version}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <Link
          href={`/courses/${courseId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline print:hidden"
        >
          ← Derse dön
        </Link>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {LEVEL_LABELS[summary.level]} özet · versiyon {summary.version} · {date(summary.createdAt)}
          {summary.verification?.edited ? " · düzenlendi" : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setSource(null); // the open source panel would cover the editor's buttons
            setEditing((v) => !v);
          }}
          disabled={saving}
        >
          {editing ? "Düzenlemeyi bırak" : "Düzenle"}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={download}>
          Markdown indir
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => window.print()}>
          PDF olarak kaydet
        </Button>
      </div>

      {summary.verification?.unverified && (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm print:hidden">
          Bu özet notlara karşı iddia iddia doğrulanmadı (doğrulama kapalıydı). Kaynak etiketleri notlardan alınan
          sayfa numaralarıdır; kesinlik için &quot;Yeniden üret&quot; ile doğrulamalı üretebilirsin.
        </p>
      )}

      {(coverage || check) && (
        <section className="space-y-2 rounded-lg border p-3 text-sm print:hidden" aria-label="Kalite göstergeleri">
          <div className="flex flex-wrap gap-2">
            {coverage && (
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium">
                Kapsam %{Math.round(coverage.coverage * 100)} ({coverage.coveredAfter}/{coverage.total})
              </span>
            )}
            {check && (
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium">
                Doğrulama: {check.claims} iddia · {check.supported} destekli
                {check.autoVerified ? ` (${check.autoVerified} hızlı)` : ""} · {check.rewritten} düzeltildi · {check.removed} kaldırıldı
              </span>
            )}
          </div>
          <button type="button" className="min-h-11 text-primary underline underline-offset-4" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Ayrıntıları gizle" : "Ayrıntıları göster"}
          </button>
          {showDetails && (
            <div className="space-y-3">
              {coverage && coverage.coveredBefore < coverage.total && (
                <p>
                  Kapsam kontrolü {coverage.total - coverage.coveredBefore} eksik maddeyi buldu
                  {coverage.rounds > 0 ? " ve özete ekletti" : ""}.
                  {coverage.missing.length > 0 && ` Hâlâ eksik: ${coverage.missing.map((m) => m.label).join("; ")}.`}
                </p>
              )}
              {check?.changes.length ? (
                <ul className="space-y-2">
                  {check.changes.map((c, i) => (
                    <li key={i} className="rounded-md bg-muted p-2">
                      <span className="font-medium">{c.status === "removed" ? "Kaldırıldı" : "Düzeltildi"}:</span> {c.before}
                      {c.after && (
                        <>
                          <br />
                          <span className="text-muted-foreground">→ {c.after}</span>
                        </>
                      )}
                      {c.reason && <span className="text-muted-foreground"> ({c.reason})</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Notlarla çelişen veya desteklenmeyen iddia bulunmadı.</p>
              )}
            </div>
          )}
        </section>
      )}

      {editing ? (
        <section className="space-y-3 print:hidden">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[60dvh] w-full rounded-lg border bg-background p-3 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Özet metni (Markdown)"
          />
          <p className="text-xs text-muted-foreground">
            Düzenlemen yeni bir versiyon olarak kaydedilir; eski versiyonlar korunur. Kaynak etiketlerini ([H1 · s.4]) silmezsen
            rozet olarak görünmeye devam eder.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button className="min-h-11" onClick={save} disabled={saving}>
              {saving ? "Kaydediliyor..." : "Yeni versiyon olarak kaydet"}
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setDraft(summary.contentMd);
                setEditing(false);
              }}
              disabled={saving}
            >
              Vazgeç
            </Button>
          </div>
        </section>
      ) : (
        <div className="max-w-none text-base leading-8">
          <Markdown content={summary.contentMd} onCitationClick={openSource} />
        </div>
      )}

      <section className="space-y-2 border-t pt-4 print:hidden">
        <h2 className="font-semibold">Seviye değiştir / yeniden üret</h2>
        <SummaryLauncher key={summary.id} target={target} existing={levels} initialLevel={summary.level} />
      </section>

      {versions.length > 1 && (
        <section className="space-y-2 print:hidden">
          <h2 className="font-semibold">Versiyonlar</h2>
          <ul className="space-y-1 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                {v.id === summary.id ? (
                  <span className="font-medium">
                    Versiyon {v.version} (şu an) · {date(v.createdAt)}
                  </span>
                ) : (
                  <Link
                    href={`/courses/${courseId}/summary/${v.id}`}
                    className="flex min-h-11 items-center underline underline-offset-4"
                  >
                    Versiyon {v.version} · {date(v.createdAt)}
                    {v.status !== "ready" ? ` · ${v.status === "draft" ? "taslak" : "başarısız"}` : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SourcePanel
        source={source?.info ?? null}
        loading={source?.loading ?? false}
        error={source?.error ?? null}
        onClose={() => setSource(null)}
      />
    </article>
  );
}
