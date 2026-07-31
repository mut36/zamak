-- ZAMAK: beta signup bonus (1 -> 3 credits)
--
-- Run this once in the Supabase SQL editor, after 0002_payments.sql.
--
-- ⚠️ 베타 한시적 변경. 링크로 배포하는 ~30명 베타테스터에게 결제 없이 3편을
--    체험시키기 위해 가입 보너스를 1편에서 3편으로 올린다. 정식 오픈(결제 활성화)
--    시점에는 반드시 되돌릴 것 — 아래 "베타 종료 후 되돌리기" 블록 참고.
--    결정 배경: docs/decisions.md (2026-07-27 항목).
--
-- 함께 바뀌어야 하는 것 (전부 되돌릴 때도 함께):
--   - app/i18n/simpleCopy.ts 의 3곳 ("1편 무료" 관련 카피)
--   - docs/TODO.md 의 "베타 종료 후 가입 크레딧 복귀" 항목
--
-- 이 마이그레이션은 *앞으로 가입하는* 계정에만 적용된다. 이미 1편을 받고 가입한
-- 계정(예: 마이그레이션 적용 전 가입자)을 3편으로 맞추려면 supabase/comp-credit.sql
-- 의 "+3 지급" 스니펫을 그 계정 이메일로 실행할 것 — 이미 있는 파일이라 여기서는
-- 손대지 않는다.

create or replace function public.grant_signup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance)
  values (new.id, 3) -- 베타 한시적: 정식 오픈 시 1로 되돌릴 것 (아래 블록 참고)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ═══════════════════ 되돌리기 블록은 0010으로 이전됨 — 아래를 실행하지 말 것 ═══
--
-- ⛔ 아래 블록은 **0004(티어제) 이전에 쓰인 것이라 지금은 틀렸다.** 실행하면
--    신규 가입자에게 크레딧 0편을 주게 된다: 0004가 `lite_balance`/`pro_balance`를
--    도입하면서 `balance`를 DEPRECATED로 내렸고, `begin_translation_job`은
--    두 새 컬럼만 차감하기 때문이다. `balance=1`만 채운 계정은 두 잔액이 0이라
--    첫 번역에서 곧바로 insufficient_credits를 맞는다.
--
--    올바른 되돌리기는 `0010_signup_credit_revert.sql`에 있다. 아래는 히스토리
--    보존용으로만 남긴다.
--
-- create or replace function public.grant_signup_credit()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- begin
--   insert into public.credits (user_id, balance)
--   values (new.id, 1)
--   on conflict (user_id) do nothing;
--   return new;
-- end;
-- $$;
