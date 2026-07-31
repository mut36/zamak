-- ZAMAK: 결제 오픈 대기자
--
-- Run this once in the Supabase SQL editor.
--
-- The exhausted screen offers this instead of a payment window during the
-- beta. The signup rate is the leading indicator for payment conversion, which
-- is the second thing the beta exists to measure.
--
-- user_id is the PK: this is offered only to signed-in users who ran out of
-- credits, so one row per account is exactly right and duplicate submissions
-- are impossible by construction.

create table if not exists public.waitlist (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist is readable by its owner" on public.waitlist;
create policy "waitlist is readable by its owner"
  on public.waitlist for select
  using (auth.uid() = user_id);

drop policy if exists "waitlist is insertable by its owner" on public.waitlist;
create policy "waitlist is insertable by its owner"
  on public.waitlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "waitlist is updatable by its owner" on public.waitlist;
create policy "waitlist is updatable by its owner"
  on public.waitlist for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
