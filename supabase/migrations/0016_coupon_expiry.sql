-- ZAMAK: 무제한 면제에 만료를 먹인다 (쿠폰 기간제)
--
-- Run this once in the Supabase SQL editor, **0014_coupons.sql과
-- 0015_credit_by_lines.sql을 모두 실행한 뒤에** 돌린다.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다.
--
-- 왜 0014가 아니라 여기인가: 0014(쿠폰)와 0015(1,200줄 과금)가 둘 다
-- begin_translation_job을 건드릴 뻔했다. 같은 함수를 두 파일이 각자의 기준
-- 본문으로 replace하면, 나중에 돌린 쪽이 앞의 것을 **에러 없이 조용히**
-- 되돌린다. 그래서 함수 교체는 전부 걷어내 이 마지막 번호 하나에 모았다.
-- 앞으로도 이 함수를 바꿀 일이 생기면 새 번호를 따서 여기 본문을 기준으로
-- 고칠 것 — 앞 번호를 편집하지 말 것.
--
-- 하는 일: 0015판을 그대로 두고 unlimited_testers 면제 판정에 만료 조건만
-- 더한다. 이게 없으면 쿠폰이 기간제가 아니라 **영구** 무제한이 된다.
-- 판정 조건은 /api/credits(app/api/credits/route.ts)와 반드시 같아야 한다 —
-- 다르면 화면은 무제한이라 하는데 번역은 거절당한다.

create or replace function public.begin_translation_job(
  p_total_blocks integer,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_job_id    uuid;
  v_kind      text;
  v_unlimited boolean;
  v_cost      integer;
  v_have      integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_total_blocks is null or p_total_blocks <= 0 then
    raise exception 'invalid block count' using errcode = '22023';
  end if;

  -- The caller passes a model id; the mapping to a balance lives here too so
  -- a client cannot pick which balance to drain.
  v_kind := case when p_model = 'gemini-3.1-pro-preview' then 'pro' else 'lite' end;

  -- 0016: 만료된 쿠폰 계정은 면제 대상이 아니다. null = 무기한(운영자).
  select exists (
    select 1 from public.unlimited_testers
     where user_id = v_user_id
       and (expires_at is null or expires_at > now())
  ) into v_unlimited;

  if not v_unlimited then
    -- 1,200은 constants.ts의 BLOCKS_PER_CREDIT과 같은 값이다. Postgres가 그
    -- 모듈을 읽을 수 없어 리터럴로 되풀이하지만, **과금 권위는 이쪽**이다 —
    -- 클라이언트가 보낸 장수를 믿지 않고 여기서 다시 센다. 값을 바꾸려면
    -- constants.ts와 이 함수를 같은 커밋에서 함께 고칠 것
    -- (constants.test.ts가 1200을 직접 단언해 그 짝을 붙들어 둔다).
    v_cost := ceil(p_total_blocks::numeric / 1200)::integer;

    -- Single statement per branch: the row lock serialises concurrent requests,
    -- so the last credits cannot be spent twice. `>= v_cost` (not `> 0`) is
    -- what makes a partial spend impossible — a 2장짜리 파일에 1장만 남았으면
    -- 1장을 깎고 실패하는 게 아니라 아무것도 깎이지 않는다.
    if v_kind = 'pro' then
      update public.credits
         set pro_balance = pro_balance - v_cost,
             updated_at = now()
       where user_id = v_user_id
         and pro_balance >= v_cost;
    else
      update public.credits
         set lite_balance = lite_balance - v_cost,
             updated_at = now()
       where user_id = v_user_id
         and lite_balance >= v_cost;
    end if;

    if not found then
      -- 잔액을 여기서 한 번 더 읽는 이유: 화면이 "2장이 필요한데 1장
      -- 남았습니다"라고 말하려면 필요 장수와 보유 장수가 둘 다 있어야 하고,
      -- 라우트가 따로 조회하면 그 사이에 값이 바뀔 수 있다. 행이 없으면
      -- (크레딧 행 자체가 없는 계정) 0으로 본다.
      select case when v_kind = 'pro' then pro_balance else lite_balance end
        into v_have
        from public.credits
       where user_id = v_user_id;

      -- 형식이 바뀌면 /api/translation/begin의 파싱도 같이 고칠 것. 'kind'가
      -- 첫 토큰이라는 점은 유지된다 — 그 라우트가 어느 잔액이 비었는지
      -- 두 번째 조회 없이 알아야 한다.
      raise exception 'insufficient credits: % need % have %',
        v_kind, v_cost, coalesce(v_have, 0)
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.translation_jobs (user_id, total_blocks, model)
  values (v_user_id, p_total_blocks, p_model)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.begin_translation_job(integer, text) from public;
grant execute on function public.begin_translation_job(integer, text) to authenticated;
