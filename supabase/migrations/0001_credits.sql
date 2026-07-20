-- ZAMAK: credits + translation jobs
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- Design notes:
--  * A credit buys one *file*, not one API call. A film is translated as many
--    parallel chunk requests, so the charge happens once when a job is opened
--    and every chunk request is then checked against that job.
--  * Balances are never written from the client. The only mutation path is the
--    security-definer function below, which decrements and opens a job in a
--    single statement so two concurrent tabs cannot both spend the last credit.

-- ---------------------------------------------------------------- credits ---

create table if not exists public.credits (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

-- Readable by its owner; not writable by anyone through the API.
drop policy if exists "credits are readable by their owner" on public.credits;
create policy "credits are readable by their owner"
  on public.credits for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------- translation jobs ---

create table if not exists public.translation_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  total_blocks integer not null,
  created_at   timestamptz not null default now()
);

create index if not exists translation_jobs_user_created_idx
  on public.translation_jobs (user_id, created_at desc);

alter table public.translation_jobs enable row level security;

drop policy if exists "jobs are readable by their owner" on public.translation_jobs;
create policy "jobs are readable by their owner"
  on public.translation_jobs for select
  using (auth.uid() = user_id);

-- --------------------------------------------------- signup grant (1 free) ---

create or replace function public.grant_signup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance)
  values (new.id, 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.grant_signup_credit();

-- ------------------------------------------------------- spend one credit ---

-- Decrements the caller's balance and opens a job, or raises if they have
-- none. Returns the job id, which the chunk endpoint then validates.
--
-- security definer so it can write a table the caller cannot write directly;
-- it still scopes every statement to auth.uid(), so a caller can only ever
-- spend their own credit.
create or replace function public.begin_translation_job(p_total_blocks integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id  uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_total_blocks is null or p_total_blocks <= 0 then
    raise exception 'invalid block count' using errcode = '22023';
  end if;

  -- Single statement: the row lock makes concurrent requests serialise, so the
  -- last credit cannot be spent twice.
  update public.credits
     set balance = balance - 1,
         updated_at = now()
   where user_id = v_user_id
     and balance > 0;

  if not found then
    raise exception 'insufficient credits' using errcode = 'P0001';
  end if;

  insert into public.translation_jobs (user_id, total_blocks)
  values (v_user_id, p_total_blocks)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.begin_translation_job(integer) from public;
grant execute on function public.begin_translation_job(integer) to authenticated;
