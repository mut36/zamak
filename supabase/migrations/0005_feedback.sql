-- ZAMAK: 번역 품질 피드백 (별점 + 자유 의견)
--
-- Run this once in the Supabase SQL editor.
--
-- This is the beta's only quantitative quality signal, so it is the one table
-- whose absence would make the beta pointless. Kept deliberately small.

create table if not exists public.feedback (
  job_id     uuid primary key references public.translation_jobs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- One row per job (job_id is the PK), so re-rating overwrites rather than
-- piling up duplicates.
drop policy if exists "feedback is readable by its owner" on public.feedback;
create policy "feedback is readable by its owner"
  on public.feedback for select
  using (auth.uid() = user_id);

drop policy if exists "feedback is insertable by its owner" on public.feedback;
create policy "feedback is insertable by its owner"
  on public.feedback for insert
  with check (
    auth.uid() = user_id
    -- Only for a job the caller actually owns; otherwise a user could rate
    -- someone else's translation.
    and exists (
      select 1 from public.translation_jobs j
       where j.id = job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "feedback is updatable by its owner" on public.feedback;
create policy "feedback is updatable by its owner"
  on public.feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
