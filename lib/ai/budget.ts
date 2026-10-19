import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfDayIstanbul } from "@/lib/utils/time";

export const DEFAULT_DAILY_TOKEN_BUDGET = 2_000_000;
export const CHAT_REQUESTS_PER_MINUTE = 20;

export type LimitCheck = { ok: true } | { ok: false; status: 429; message: string };

export type UsageRow = { purpose: string; input_tokens: number; output_tokens: number; calls: number };

export function dailyBudget(raw: string | undefined = process.env.DAILY_TOKEN_BUDGET): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_TOKEN_BUDGET;
}

export function totalTokens(rows: Pick<UsageRow, "input_tokens" | "output_tokens">[]): number {
  return rows.reduce((sum, r) => sum + Number(r.input_tokens) + Number(r.output_tokens), 0);
}

export async function usageSince(supabase: SupabaseClient, since: Date): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc("usage_totals", { p_since: since.toISOString() });
  if (error) throw new Error(error.message);
  return (data ?? []) as UsageRow[];
}

// Stops new model work once today's tokens reach the daily safety limit.
export async function checkDailyBudget(supabase: SupabaseClient): Promise<LimitCheck> {
  const used = totalTokens(await usageSince(supabase, startOfDayIstanbul()));
  const budget = dailyBudget();
  if (used < budget) return { ok: true };
  return {
    ok: false,
    status: 429,
    message: `Bugünkü kullanım sınırına ulaştın (${used.toLocaleString("tr-TR")} / ${budget.toLocaleString("tr-TR")} token). Yarın tekrar dene ya da sınırı DAILY_TOKEN_BUDGET ayarından artır.`,
  };
}

// At most CHAT_REQUESTS_PER_MINUTE chat messages per user per minute.
export async function checkChatRate(supabase: SupabaseClient): Promise<LimitCheck> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  if ((count ?? 0) < CHAT_REQUESTS_PER_MINUTE) return { ok: true };
  return { ok: false, status: 429, message: "Çok hızlı mesaj gönderiyorsun. Bir dakika bekleyip tekrar dene." };
}
