-- Embeddings are optional (AI_EMBEDDINGS=off): chunks may be stored without a vector, and notes are then
-- searched with full text only.

alter table chunks alter column embedding drop not null;

-- Full-text-only search. query_text is a ready tsquery string built by the app (words joined with " | ",
-- each as a prefix match so Turkish suffixes still match), e.g. 'diferan:* | denkle:*'.
create or replace function match_chunks_text(
  query_text text,
  p_course_id uuid default null,
  p_weeks int[] default null,
  match_count int default 8
) returns table (
  id uuid, document_id uuid, course_id uuid, week_number int,
  page_start int, page_end int, heading text, content text, score real
) language sql stable security invoker set search_path = public, pg_temp as $$
  select c.id, c.document_id, c.course_id, c.week_number, c.page_start, c.page_end,
         c.heading, c.content, ts_rank_cd(c.fts, q.query)::real as score
  from chunks c, (select to_tsquery('simple', query_text) as query) q
  where c.fts @@ q.query
    and (p_course_id is null or c.course_id = p_course_id)
    and (p_weeks is null or c.week_number = any(p_weeks))
  order by score desc
  limit match_count;
$$;
