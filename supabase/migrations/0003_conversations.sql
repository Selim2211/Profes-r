-- Phase 3: conversations and messages

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid references courses(id) on delete set null,  -- null = general chat
  title text,
  rolling_summary text,
  summarized_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  citations jsonb default '[]',        -- [{chunk_id, document_id, week, page}]
  tool_calls jsonb,
  created_at timestamptz default now()
);

alter table conversations enable row level security;
alter table messages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['conversations','messages']
  loop
    execute format('create policy "%1$s_select_own" on %1$s for select using (user_id = auth.uid())', t);
    execute format('create policy "%1$s_insert_own" on %1$s for insert with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_update_own" on %1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_delete_own" on %1$s for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

create index on conversations (user_id, updated_at desc);
create index on messages (conversation_id, created_at);
