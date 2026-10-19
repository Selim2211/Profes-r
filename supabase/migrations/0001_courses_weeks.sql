-- Phase 1: allowed emails gate, courses, weeks (+ RLS)

create extension if not exists vector;

-- Allow-list for sign-ups. RLS on with no policies: only the service role / SQL editor can touch it.
create table if not exists allowed_emails (
  email text primary key
);
alter table allowed_emails enable row level security;

insert into allowed_emails (email) values ('selimaknc1907@gmail.com')
  on conflict do nothing;

-- Reject sign-ups for emails that are not on the list (covers direct calls to the Auth API too).
create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'Bu e-posta adresi için kayıt izni yok.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email_trigger on auth.users;
create trigger enforce_allowed_email_trigger
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();

-- Courses
create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  code text,
  description text,
  created_at timestamptz default now()
);

-- Weeks
create table weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  course_id uuid not null references courses(id) on delete cascade,
  week_number int not null,
  title text,
  summary text,
  summary_updated_at timestamptz,
  unique (course_id, week_number)
);

alter table courses enable row level security;
alter table weeks enable row level security;

create policy "courses_select_own" on courses for select using (user_id = auth.uid());
create policy "courses_insert_own" on courses for insert with check (user_id = auth.uid());
create policy "courses_update_own" on courses for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "courses_delete_own" on courses for delete using (user_id = auth.uid());

create policy "weeks_select_own" on weeks for select using (user_id = auth.uid());
create policy "weeks_insert_own" on weeks for insert with check (user_id = auth.uid());
create policy "weeks_update_own" on weeks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weeks_delete_own" on weeks for delete using (user_id = auth.uid());

create index on courses (user_id);
create index on weeks (course_id);
