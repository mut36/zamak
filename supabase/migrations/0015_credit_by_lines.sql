-- ZAMAK: 번역권 차감을 "파일 1개 = 1장"에서 "자막 1,200줄 = 1장"으로
--
-- Run this once in the Supabase SQL editor, after 0013_unlimited_testers.sql.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다 — 한쪽만 돌리면 같은 파일이
-- 개발에선 2장, 배포에선 1장 나가고 그 차이는 조용하다.
--
-- (0014는 쿠폰 작업용으로 예약돼 있다 —
--  docs/superpowers/specs/2026-08-21-coupon-unlimited-design.md)
--
-- 왜 바꾸는가: 원가는 줄 수에 선형인데(docs/tuning/cost-per-block.md) 차감은
-- 파일 단위였다. 같은 1장인데 원가가 4.6배 벌어졌고, 프로 장편(1,874줄)은
-- 마진 6%, 상한(2,000줄)에서는 0%였다. 1,200줄마다 1장 올림 차감이면 어떤
-- 길이에서도 40% 아래로 내려가지 않는다. 자세한 근거는 docs/decisions.md §6-22
-- (§1-4 "크레딧은 파일 단위로 차감한다"를 뒤집는다).
--
-- 덤: 길이 상한이 사라진다. 지금까지는 2,000줄을 넘으면 413으로 **거부**했고
-- 긴 파일을 다루는 전문 번역가에게는 막다른 길이었다. 이제 더 긴 파일은
-- 거부되는 대신 장수를 더 쓴다.

-- 0013판을 그대로 두고 차감 한 덩어리만 바꾼다. 시그니처가 같으므로 drop 없이
-- replace한다 — grant도 유지된다. unlimited_testers 면제 분기와 job insert는
-- 손대지 않는다.
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

  select exists (
    select 1 from public.unlimited_testers where user_id = v_user_id
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
