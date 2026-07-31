-- ZAMAK: 베타 계측 (번역 1회당 실측치 + 퍼널 이벤트 + 피드백 확장)
--
-- Run this once in the Supabase SQL editor, after 0008_copyright_consents.sql.
--
-- Three separate things, one migration because they exist for one reason: the
-- beta is 30 people and we get one pass at learning from it.
--
--   1. translation_jobs  — per-run measurements (blocks, language, timings)
--   2. translation_chunk_usage — one row per model call (tokens, latency)
--   3. beta_events       — funnel steps that leave no other trace
--   4. feedback          — what a star rating cannot say
--
-- NOTHING HERE STORES SUBTITLE TEXT. The privacy policy says the source's
-- contents are never recorded, and that promise is what decides the shape of
-- every column below: counts, codes, block *numbers* — never a line of dialog.
-- feedback.reported_blocks is the sharp edge: it is an integer array, and the
-- text those numbers point at is read from the stored result (0007), which the
-- user already knows we keep for 30 days.

-- ------------------------------------------------ 1. per-run measurements ---

-- Written once, at the end of a run, by record_job_metrics. Every column is
-- nullable: a job that crashed mid-way still has its row from
-- begin_translation_job, and an absent measurement must read as "we never got
-- there", not as zero.
alter table public.translation_jobs
  add column if not exists source_format    text,
  add column if not exists target_lang      text,
  add column if not exists total_chunks     integer,
  add column if not exists chunk_size       integer,
  add column if not exists concurrency      integer,
  add column if not exists duration_ms      integer,
  add column if not exists failed_chunks    integer,
  add column if not exists fallback_blocks  integer,
  add column if not exists recovered_blocks integer,
  add column if not exists sweep_calls      integer,
  add column if not exists stop_reason      text,
  add column if not exists glossary_terms   integer,
  add column if not exists relation_pairs   integer,
  add column if not exists text_rules       jsonb;

comment on column public.translation_jobs.fallback_blocks is
  'Lines still holding their original text after the recovery sweep. The one '
  'number that decides the credit-refund policy (docs/TODO.md).';

-- One statement, one job, caller-scoped. Metrics arrive from the browser, so
-- this is untrusted input in the same way record_job_result is: the row is
-- found by auth.uid(), never by a user_id in the payload.
create or replace function public.record_job_metrics(
  p_job_id           uuid,
  p_source_format    text,
  p_target_lang      text,
  p_total_chunks     integer,
  p_chunk_size       integer,
  p_concurrency      integer,
  p_duration_ms      integer,
  p_failed_chunks    integer,
  p_fallback_blocks  integer,
  p_recovered_blocks integer,
  p_sweep_calls      integer,
  p_stop_reason      text,
  p_glossary_terms   integer,
  p_relation_pairs   integer,
  p_text_rules       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.translation_jobs
     set source_format    = p_source_format,
         target_lang      = p_target_lang,
         total_chunks     = p_total_chunks,
         chunk_size       = p_chunk_size,
         concurrency      = p_concurrency,
         duration_ms      = p_duration_ms,
         failed_chunks    = p_failed_chunks,
         fallback_blocks  = p_fallback_blocks,
         recovered_blocks = p_recovered_blocks,
         sweep_calls      = p_sweep_calls,
         stop_reason      = p_stop_reason,
         glossary_terms   = p_glossary_terms,
         relation_pairs   = p_relation_pairs,
         text_rules       = p_text_rules
   where id = p_job_id
     and user_id = v_user_id;

  if not found then
    raise exception 'job not found' using errcode = 'P0001';
  end if;
end;
$$;

-- ------------------------------------------------- 2. per-model-call usage ---

-- One row per model call, NOT per chunk: a retried chunk and every recovery
-- sweep round get their own row. That is the point — "how many calls did this
-- file really cost" is a question the job row cannot answer, and the tuning
-- docs (docs/tuning/chunk-size-model.md) currently rest on a one-file sample
-- measured by hand.
create table if not exists public.translation_chunk_usage (
  id             bigserial primary key,
  job_id         uuid not null references public.translation_jobs (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- 1-based, as sent on the wire. The sweep sends 1/1, so `phase` is what
  -- separates a sweep round from the main pass's first chunk.
  chunk_index    integer not null,
  total_chunks   integer not null,
  phase          text not null default 'main' check (phase in ('main', 'sweep')),
  blocks         integer not null,
  model          text not null,
  thinking_level text,
  prompt_tokens  integer not null default 0,
  cached_tokens  integer not null default 0,
  thoughts_tokens integer not null default 0,
  output_tokens  integer not null default 0,
  latency_ms     integer not null default 0,
  ok             boolean not null,
  error_code     text,
  created_at     timestamptz not null default now()
);

create index if not exists chunk_usage_job_idx
  on public.translation_chunk_usage (job_id);
create index if not exists chunk_usage_created_idx
  on public.translation_chunk_usage (created_at desc);

alter table public.translation_chunk_usage enable row level security;

drop policy if exists "chunk usage is readable by its owner" on public.translation_chunk_usage;
create policy "chunk usage is readable by its owner"
  on public.translation_chunk_usage for select
  using (auth.uid() = user_id);

-- Insert-only, and only against a job the caller owns. Written by the server
-- route on the caller's session, so the same check that guards feedback
-- guards this.
drop policy if exists "chunk usage is insertable by its owner" on public.translation_chunk_usage;
create policy "chunk usage is insertable by its owner"
  on public.translation_chunk_usage for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.translation_jobs j
       where j.id = job_id and j.user_id = auth.uid()
    )
  );

-- No update/delete policy: a measurement that can be rewritten is not a
-- measurement.

-- --------------------------------------------------- 3. funnel events ---

-- Only steps that leave no other trace. Anything derivable from
-- translation_jobs (how many files, which model, how many blocks) is
-- deliberately NOT an event — a second, weaker copy of a fact we already have
-- is how counts start disagreeing with each other.
create table if not exists public.beta_events (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  event      text not null,
  -- Small, flat, and never free text from a subtitle: format, reason code,
  -- extension, boolean toggles.
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beta_events_created_idx
  on public.beta_events (created_at desc);
create index if not exists beta_events_event_idx
  on public.beta_events (event, created_at desc);

alter table public.beta_events enable row level security;

drop policy if exists "events are readable by their owner" on public.beta_events;
create policy "events are readable by their owner"
  on public.beta_events for select
  using (auth.uid() = user_id);

drop policy if exists "events are insertable by their owner" on public.beta_events;
create policy "events are insertable by their owner"
  on public.beta_events for insert
  with check (auth.uid() = user_id);

-- ------------------------------------------------- 4. feedback expansion ---

-- `rating` tells us a score; these tell us what to fix.
--
--   usability      — did the file actually get USED? The single most
--                    decision-relevant answer we can get, and one nobody can
--                    give on the completion screen: at that moment they have
--                    not opened the file yet. Asked on a LATER visit instead.
--   issue_kinds    — each value maps to a different file in the pipeline, so a
--                    free-text complaint that has to be hand-classified is a
--                    signal we would in practice never process.
--   reported_blocks— sequence numbers only (see the header note on privacy).
alter table public.feedback
  add column if not exists usability       text
    check (usability is null or usability in
      ('as-is', 'minor-edits', 'major-edits', 'unusable')),
  add column if not exists issue_kinds     text[] not null default '{}',
  add column if not exists reported_blocks integer[] not null default '{}',
  -- Set when the user closes the follow-up without answering. Without it the
  -- same question returns on every visit forever, which is how a survey
  -- teaches people to dismiss it on sight.
  add column if not exists followup_dismissed_at timestamptz;

comment on column public.feedback.reported_blocks is
  'SRT sequence numbers the user flagged. Numbers only — the lines themselves '
  'are read from the stored result (0007_job_results.sql), never copied here.';

-- The follow-up can arrive before any star rating (the completion screen's
-- rating is optional and often skipped), so a feedback row must be able to
-- exist without one. The 1..5 check still applies when a rating IS given.
alter table public.feedback alter column rating drop not null;

-- Which finished job to ask about on the next visit, if any.
--
-- Deliberately server-side: "a later visit" is a time rule, and a client that
-- decides for itself when enough time has passed will drift. FOLLOWUP_DELAY
-- is one interval in one place.
create or replace function public.pending_feedback_job()
returns table (
  job_id          uuid,
  source_filename text,
  model           text,
  completed_at    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select j.id, j.source_filename, j.model, j.completed_at
    from public.translation_jobs j
    left join public.feedback f on f.job_id = j.id
   where j.user_id = auth.uid()
     and j.completed_at is not null
     -- Long enough that they have plausibly opened the file, short enough to
     -- still remember it. Also what makes this a *later visit*: a user who
     -- translates twice in one sitting is never interrupted.
     and j.completed_at < now() - interval '6 hours'
     -- 0007 keeps results 30 days; past that we cannot show them the lines
     -- they would be talking about, so asking is worse than not asking.
     and j.completed_at > now() - interval '30 days'
     and f.usability is null
     and f.followup_dismissed_at is null
   order by j.completed_at desc
   limit 1;
$$;
