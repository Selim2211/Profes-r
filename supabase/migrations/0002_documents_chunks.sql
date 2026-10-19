-- Phase 2: documents, pages, chunks, topics, ingestion jobs, hybrid search, storage

create table topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid not null references courses(id) on delete cascade,
  week_number int,
  name text not null,
  description text,
  unique (course_id, name)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid not null references courses(id) on delete cascade,
  week_number int,
  title text not null,
  storage_path text not null,
  page_count int,
  status text not null default 'pending'
    check (status in ('pending','processing','ready','failed')),
  error text,
  created_at timestamptz default now()
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  week_number int,
  page_start int not null,
  page_end int not null,
  chunk_index int not null,
  heading text,
  content text not null,
  token_count int,
  embedding vector(768) not null,
  fts tsvector generated always as (to_tsvector('simple', content)) stored,
  unique (document_id, chunk_index)
);
create index on chunks using hnsw (embedding vector_cosine_ops);
create index on chunks using gin (fts);
create index on chunks (course_id, week_number);

create table chunk_topics (
  chunk_id uuid references chunks(id) on delete cascade,
  topic_id uuid references topics(id) on delete cascade,
  primary key (chunk_id, topic_id)
);

create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  stage text not null default 'extract'
    check (stage in ('extract','chunk','embed','summarize','done','failed')),
  next_page int not null default 1,
  progress int not null default 0,
  error text,
  failed_stage text,                       -- stage to resume from on retry
  updated_at timestamptz default now()
);

create table document_pages (
  document_id uuid references documents(id) on delete cascade,
  page_number int not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  text text not null,
  ocr_used boolean default false,
  primary key (document_id, page_number)
);

-- RLS: every user only sees their own rows
alter table topics enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table chunk_topics enable row level security;
alter table ingestion_jobs enable row level security;
alter table document_pages enable row level security;

do $$
declare t text;
begin
  foreach t in array array['topics','documents','chunks','ingestion_jobs','document_pages']
  loop
    execute format('create policy "%1$s_select_own" on %1$s for select using (user_id = auth.uid())', t);
    execute format('create policy "%1$s_insert_own" on %1$s for insert with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_update_own" on %1$s for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s_delete_own" on %1$s for delete using (user_id = auth.uid())', t);
  end loop;
end $$;

create policy "chunk_topics_select_own" on chunk_topics for select
  using (exists (select 1 from chunks c where c.id = chunk_id and c.user_id = auth.uid()));
create policy "chunk_topics_insert_own" on chunk_topics for insert
  with check (exists (select 1 from chunks c where c.id = chunk_id and c.user_id = auth.uid())
          and exists (select 1 from topics t where t.id = topic_id and t.user_id = auth.uid()));
create policy "chunk_topics_delete_own" on chunk_topics for delete
  using (exists (select 1 from chunks c where c.id = chunk_id and c.user_id = auth.uid()));

create index on documents (course_id, week_number);
create index on ingestion_jobs (document_id);

-- Hybrid search: vector similarity + full text, merged with Reciprocal Rank Fusion.
create or replace function match_chunks(
  query_embedding vector(768),
  query_text text,
  p_course_id uuid default null,
  p_weeks int[] default null,
  match_count int default 8
) returns table (
  id uuid, document_id uuid, course_id uuid, week_number int,
  page_start int, page_end int, heading text, content text, score real
) language sql stable security invoker as $$
  with vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from chunks c
    where (p_course_id is null or c.course_id = p_course_id)
      and (p_weeks is null or c.week_number = any(p_weeks))
    order by c.embedding <=> query_embedding
    limit match_count * 4
  ),
  fts as (
    select c.id, row_number() over (order by ts_rank(c.fts, plainto_tsquery('simple', query_text)) desc) as rank
    from chunks c
    where c.fts @@ plainto_tsquery('simple', query_text)
      and (p_course_id is null or c.course_id = p_course_id)
      and (p_weeks is null or c.week_number = any(p_weeks))
    limit match_count * 4
  ),
  fused as (
    select coalesce(v.id, f.id) as id,
      coalesce(1.0/(60+v.rank),0) + coalesce(1.0/(60+f.rank),0) as score
    from vec v full outer join fts f on v.id = f.id
  )
  select c.id, c.document_id, c.course_id, c.week_number, c.page_start, c.page_end,
         c.heading, c.content, fused.score::real
  from fused join chunks c on c.id = fused.id
  order by fused.score desc
  limit match_count;
$$;

-- Storage: private bucket, files live under {user_id}/{course_id}/{document_id}.ext
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

create policy "documents_storage_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents_storage_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents_storage_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documents_storage_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
