-- Phase 4 (summary pipeline): page transcription flags, summaries, section summaries, summary jobs

-- Faithful transcription: which pages were re-transcribed from the PDF image, and why
alter table document_pages add column if not exists reextracted boolean not null default false;
alter table document_pages add column if not exists reextract_reason text;

-- Per-document switch: transcribe every page from the PDF image (formula/table heavy notes)
alter table documents add column if not exists transcribe_all boolean not null default false;

-- Final summaries. Edits and regenerations are stored as new versions; old versions are kept.
create table summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid not null references courses(id) on delete cascade,
  scope text not null check (scope in ('document','week')),
  document_id uuid references documents(id) on delete cascade,
  week_number int,
  level text not null check (level in ('short','standard','detailed')),
  content_md text not null,
  coverage real,                          -- 0.0 - 1.0
  verification jsonb,                     -- {claims, supported, removed, rewritten, ...}
  status text not null default 'ready' check (status in ('draft','ready','failed')),
  version int not null default 1,
  model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check ((scope = 'document' and document_id is not null) or (scope = 'week' and week_number is not null))
);
create index on summaries (course_id, scope, week_number, level, version desc);
create index on summaries (document_id, level, version desc);

-- Intermediate MAP results, one row per section of a document
create table section_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  section_index int not null,
  title text,
  page_start int not null,
  page_end int not null,
  source_hash text not null,              -- hash of the section text; unchanged text is not re-summarized
  content jsonb not null,                 -- {keyPoints, definitions, formulas, examples, warnings}
  created_at timestamptz default now(),
  unique (document_id, section_index)
);

-- Long summary runs advance step by step, like ingestion_jobs
create table summary_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid not null references courses(id) on delete cascade,
  scope text not null check (scope in ('document','week')),
  document_id uuid references documents(id) on delete cascade,
  week_number int,
  level text not null check (level in ('short','standard','detailed')),
  step text not null default 'transcribe'
    check (step in ('transcribe','section','map','reduce','coverage','verify','done','failed')),
  progress int not null default 0,
  cursor jsonb not null default '{}',     -- step-specific resume state
  error text,
  failed_step text,
  summary_id uuid references summaries(id) on delete set null,
  updated_at timestamptz default now()
);
create index on summary_jobs (course_id, updated_at desc);

alter table summaries enable row level security;
alter table section_summaries enable row level security;
alter table summary_jobs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['summaries','section_summaries','summary_jobs']
  loop
    execute format('create policy "%1$s_select_own" on %1$s for select using (user_id = auth.uid())', t);
    execute format('create policy "%1$s_insert_own" on %1$s for insert with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_update_own" on %1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_delete_own" on %1$s for delete using (user_id = auth.uid())', t);
  end loop;
end $$;
