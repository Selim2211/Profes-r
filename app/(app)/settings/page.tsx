import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHAT_REQUESTS_PER_MINUTE, dailyBudget, totalTokens, usageSince, type UsageRow } from "@/lib/ai/budget";
import { createClient } from "@/lib/supabase/server";
import { startOfDayIstanbul, startOfMonthIstanbul } from "@/lib/utils/time";

export const metadata: Metadata = { title: "Ayarlar" };

const PURPOSE_LABELS: Record<string, string> = {
  chat: "Sohbet",
  embed: "Vektör hesaplama",
  ocr: "Sayfa okuma (görselden aktarım)",
  summarize: "Özet ve doğrulama",
  quiz: "Quiz",
  memory: "Hafıza",
  plan: "Plan",
};

const number = (value: number) => value.toLocaleString("tr-TR");

function UsageTable({ rows }: { rows: UsageRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Henüz kullanım yok.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">İşlem</th>
            <th className="py-2 pr-3 text-right font-medium">Çağrı</th>
            <th className="py-2 pr-3 text-right font-medium">Giriş</th>
            <th className="py-2 text-right font-medium">Çıkış</th>
          </tr>
        </thead>
        <tbody>
          {[...rows]
            .sort((a, b) => totalTokens([b]) - totalTokens([a]))
            .map((row) => (
              <tr key={row.purpose} className="border-b last:border-0">
                <td className="py-2 pr-3">{PURPOSE_LABELS[row.purpose] ?? row.purpose}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{number(Number(row.calls))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{number(Number(row.input_tokens))}</td>
                <td className="py-2 text-right tabular-nums">{number(Number(row.output_tokens))}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

async function Usage() {
  const supabase = await createClient();
  const [today, month, { data: auth }] = await Promise.all([
    usageSince(supabase, startOfDayIstanbul()),
    usageSince(supabase, startOfMonthIstanbul()),
    supabase.auth.getUser(),
  ]);

  const used = totalTokens(today);
  const budget = dailyBudget();
  const percent = Math.min(100, Math.round((used / budget) * 100));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bugünkü kullanım</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1" role="status">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={percent >= 90 ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-sm">
              {number(used)} / {number(budget)} token (%{percent})
            </p>
            <p className="text-xs text-muted-foreground">
              Günlük sınıra ulaşılınca yeni yapay zekâ işleri yarına kadar durur; yarım kalan özetler kaldığı yerden devam eder.
            </p>
          </div>
          <UsageTable rows={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bu ay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{number(totalTokens(month))} token</p>
          <UsageTable rows={month} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hesap ve sınırlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Giriş: {auth.user?.email ?? "bilinmiyor"}</p>
          <p>Sohbet hız sınırı: dakikada en fazla {CHAT_REQUESTS_PER_MINUTE} mesaj.</p>
          <p>Gün ve ay başlangıcı Europe/Istanbul saatine göredir.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Ayarlar</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
        <Usage />
      </Suspense>
    </div>
  );
}
