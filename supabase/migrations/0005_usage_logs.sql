-- Phase 8: token usage log (daily budget + usage display)

create table usage_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  model text not null,
  purpose text not null,                  -- chat | embed | ocr | summarize | quiz | memory | plan
  input_tokens int,
  output_tokens int,
  created_at timestamptz default now()
);
create index on usage_logs (user_id, created_at desc);

alter table usage_logs enable row level security;
create policy "usage_logs_select_own" on usage_logs for select using (user_id = auth.uid());
create policy "usage_logs_insert_own" on usage_logs for insert with check (user_id = auth.uid());

-- Token totals per purpose since a point in time (security invoker: RLS limits it to the caller's rows).
create or replace function usage_totals(p_since timestamptz)
returns table (purpose text, input_tokens bigint, output_tokens bigint, calls bigint)
language sql stable security invoker as $$
  select u.purpose,
         coalesce(sum(u.input_tokens), 0)::bigint,
         coalesce(sum(u.output_tokens), 0)::bigint,
         count(*)::bigint
  from usage_logs u
  where u.created_at >= p_since
  group by u.purpose
$$;

-- Security hardening found by the Supabase advisor
alter function public.match_chunks(vector, text, uuid, int[], int) set search_path = public;
alter function public.usage_totals(timestamptz) set search_path = public;
-- The sign-up gate trigger runs on its own; nobody needs to call it through the API.
revoke execute on function public.enforce_allowed_email() from public, anon, authenticated;
