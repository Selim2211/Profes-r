import type { SupabaseClient } from "@supabase/supabase-js";
import { checkChatRate, checkDailyBudget } from "./budget";
import { withUsage, type UsagePurpose } from "./usage";

// Wraps the model-using part of an API route: refuses the request (HTTP 429, readable Turkish message)
// when the daily token budget or the chat rate limit is used up, otherwise runs it with the user's
// usage logging switched on.
export async function runGuarded(
  supabase: SupabaseClient,
  userId: string,
  purpose: UsagePurpose,
  options: { chatRate?: boolean },
  run: () => Promise<Response>,
): Promise<Response> {
  const budget = await checkDailyBudget(supabase);
  if (!budget.ok) return Response.json({ error: budget.message }, { status: budget.status });

  if (options.chatRate) {
    const rate = await checkChatRate(supabase);
    if (!rate.ok) return Response.json({ error: rate.message }, { status: rate.status });
  }
  return withUsage({ supabase, userId }, purpose, run);
}
