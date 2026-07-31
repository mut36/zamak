-- ZAMAK: 번역 결과물 보관
--
-- Run this once in the Supabase SQL editor. Then create a PRIVATE Storage
-- bucket named `results` in the Supabase dashboard (Storage → New bucket,
-- "Public bucket" OFF) — the policies below assume it exists.
--
-- We store the RESULT ONLY, never the uploaded source. Two reasons: the source
-- is the user's copyrighted material and we have no standing reason to hold it,
-- and the result is the thing a credit paid for.
--
-- Retention is 30 days, enforced in the UI (the beta ships without a cleanup
-- job — see docs/TODO.md). Objects therefore outlive their download button.

alter table public.translation_jobs
  add column if not exists source_filename text,
  add column if not exists result_path     text,
  add column if not exists options         jsonb,
  add column if not exists completed_at    timestamptz;

-- `model` is added in 0004 (begin_translation_job writes it).

-- ---------------------------------------------------------- storage policies ---

-- Objects are keyed <user_id>/<job_id>.ko.srt, so the first path segment is the
-- owner and one policy covers every object without a per-row join.
drop policy if exists "results are readable by their owner" on storage.objects;
create policy "results are readable by their owner"
  on storage.objects for select
  using (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "results are insertable by their owner" on storage.objects;
create policy "results are insertable by their owner"
  on storage.objects for insert
  with check (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "results are updatable by their owner" on storage.objects;
create policy "results are updatable by their owner"
  on storage.objects for update
  using (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------- record a finished result ---

-- security definer so the row can be written without opening translation_jobs
-- to client writes; every statement is still scoped to auth.uid().
create or replace function public.record_job_result(
  p_job_id uuid,
  p_filename text,
  p_result_path text,
  p_options jsonb
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
     set source_filename = p_filename,
         result_path     = p_result_path,
         options         = p_options,
         completed_at    = now()
   where id = p_job_id
     and user_id = v_user_id;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.record_job_result(uuid, text, text, jsonb) from public;
grant execute on function public.record_job_result(uuid, text, text, jsonb) to authenticated;
