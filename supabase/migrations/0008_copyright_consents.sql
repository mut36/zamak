-- ZAMAK: 저작권 안내 동의 기록
--
-- Run this once in the Supabase SQL editor.
--
-- The upload terms put the rights and responsibility for uploaded files on the
-- user. That only means something if we can say when a given account agreed,
-- and to which wording.

create table if not exists public.copyright_consents (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  version  text not null,
  agreed_at timestamptz not null default now()
);

alter table public.copyright_consents enable row level security;

drop policy if exists "consents are readable by their owner" on public.copyright_consents;
create policy "consents are readable by their owner"
  on public.copyright_consents for select
  using (auth.uid() = user_id);

drop policy if exists "consents are insertable by their owner" on public.copyright_consents;
create policy "consents are insertable by their owner"
  on public.copyright_consents for insert
  with check (auth.uid() = user_id);

drop policy if exists "consents are updatable by their owner" on public.copyright_consents;
create policy "consents are updatable by their owner"
  on public.copyright_consents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
