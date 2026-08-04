-- ZAMAK: 이벤트 지급 이력 + 자동 지급 함수
--
-- Run this once in the Supabase SQL editor, after 0011_rate_limits_and_errors.sql.
--
-- 피드백 리워드 이벤트(인앱 피드백 → 라이트 1, 카톡·이메일 문의 → 프로 1)의
-- 기반이다. event_grants는 이번 이벤트 하나에 묶인 표가 아니라 **범용 지급
-- 이력**이다 — 다음에 다른 이벤트가 생겨도 event_code만 새로 쓰면 되고,
-- 기본키(user_id, event_code)가 중복 지급을 원천 차단한다.
--
-- api_rate_limits(0011)와 같은 이유로 RLS는 켜되 정책은 하나도 안 만든다 —
-- 이 표는 security definer 함수와 서비스 롤(수동 지급 SQL Editor 세션)을
-- 통해서만 읽고 쓴다.

create table if not exists public.event_grants (
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_code  text not null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, event_code)
);

alter table public.event_grants enable row level security;

-- 자기 계정으로 로그인한 유저가 자기 몫의 이벤트 크레딧을 스스로 요청하는
-- 함수. begin_translation_job(0004)과 같은 security definer + auth.uid() 패턴.
create or replace function public.grant_event_credit(
  p_event_code text,
  p_kind       text
)
returns table (credits_granted integer, already_granted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  -- row_count는 정수형이라 boolean이 아니라 integer로 받는다.
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.event_grants (user_id, event_code)
  values (v_user_id, p_event_code)
  on conflict (user_id, event_code) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select 0, true;
    return;
  end if;

  if p_kind = 'pro' then
    update public.credits set pro_balance = pro_balance + 1, updated_at = now()
     where user_id = v_user_id;
  else
    update public.credits set lite_balance = lite_balance + 1, updated_at = now()
     where user_id = v_user_id;
  end if;

  return query select 1, false;
end;
$$;

revoke all on function public.grant_event_credit(text, text) from public;
grant execute on function public.grant_event_credit(text, text) to authenticated;
