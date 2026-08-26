-- ZAMAK: 무제한 테스터는 레이트 리밋도 면제
--
-- Run this once in the Supabase SQL editor, after 0017_prepass_usage.sql.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다 — 0013과 같은 이유다.
--
-- 왜 필요한가: 0013이 `unlimited_testers`를 만들 때 면제한 것은 **차감**뿐이다
-- (begin_translation_job). 그런데 크레딧을 안 쓰는 경로들은 애초에 차감이 아니라
-- **레이트 리밋**이 천장이라(`RATE_LIMITS`, 0011), 무제한 계정도 규칙 적용
-- `/api/polish`를 하루 5회 쓰면 막혔다. "무제한"이라는 이름이 지키지 못하는
-- 약속이 되어 있었다.
--
-- 버킷을 가리지 않는다. 무제한 계정은 이 앱의 어떤 한도에도 걸리지 않는 것이
-- 이 표의 뜻이고, 버킷별로 갈라 두면 새 버킷이 생길 때마다 같은 사고가 반복된다.
--
-- **횟수는 계속 센다.** allowed만 무조건 true로 돌린다 — 면제 계정이 실제로
-- 얼마나 쓰는지는 api_rate_limits에 그대로 남아야 사용량을 볼 수 있다.
-- (여기서 카운팅을 건너뛰면 그 계정의 사용은 `api-usage.sql`에서만 보이고
-- 호출 빈도는 아무 데도 안 남는다.)
--
-- 위험은 0013과 같은 크기다: 여기 든 계정은 매출 없이 Gemini를 돌릴 수 있다.
-- 대상은 운영자 계정으로 한정하고, 회수는 delete 한 줄이다(dev-seed.sql 7번).

create or replace function public.consume_rate_limit(
  p_bucket          text,
  p_limit           integer,
  p_window_seconds  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_hits      integer;
  v_start     timestamptz;
  v_unlimited boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- security definer로 도므로 unlimited_testers의 RLS(본인 행만 select)와
  -- 무관하게 읽는다. begin_translation_job이 하는 것과 같은 조회다.
  select exists (
    select 1 from public.unlimited_testers where user_id = v_user_id
  ) into v_unlimited;

  -- 창이 지났으면 리셋, 아니면 증가. 두 SET 식 모두 **갱신 전** 행을 읽으므로
  -- 한 문장 안에서 판정과 증가가 같은 창을 본다(경쟁 조건 없음).
  insert into public.api_rate_limits as l (user_id, bucket, window_start, hits)
       values (v_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
     set window_start = case
           when l.window_start < now() - make_interval(secs => p_window_seconds)
           then now() else l.window_start end,
         hits = case
           when l.window_start < now() - make_interval(secs => p_window_seconds)
           then 1 else l.hits + 1 end
   returning l.hits, l.window_start into v_hits, v_start;

  return jsonb_build_object(
    'allowed', v_unlimited or v_hits <= p_limit,
    -- 창이 닫힐 때까지 남은 초(올림, 최소 1). 허용된 호출에도 담기지만
    -- 라우트는 거절할 때만 읽는다.
    'retry_after', greatest(
      1,
      ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds)) - now()))
    )::integer
  );
end;
$$;

-- grant를 다시 적지 않는다. 시그니처가 0011과 같아 `create or replace`가
-- 기존 권한을 그대로 유지한다 — 여기서 revoke/grant를 새로 쓰면 0011이 의도한
-- 권한 상태를 이 파일이 조용히 바꾸게 된다.
