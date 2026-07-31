-- ZAMAK: 가입 크레딧 베타 특별지급 해제 (라이트3+프로1 → 라이트1+프로0)
--
-- ⚠️ 아직 실행하지 말 것 — 결제(토스) 오픈 시점에 실행한다.
--    작성만 미리 해둔 이유는 아래 "왜 0003의 되돌리기 블록을 쓰면 안 되는가"다.
--    실행 시점 판단: docs/TODO.md "정식 오픈 시: 가입 크레딧 복귀".
--
-- 배경: 0003이 베타테스터 ~30명에게 결제 없이 체험시키려고 가입 보너스를
-- 1편 → 3편으로 올렸고(decisions.md §1-10), 0004가 그걸 티어제(라이트3+프로1)로
-- 옮겼다. 결제가 열리면 프로는 미끼가 아니라 판매 대상이 되므로 지급에서 빼고,
-- 라이트만 원래의 1편으로 되돌린다.
--
-- ══════════ 왜 0003 하단의 "베타 종료 후 되돌리기" 블록을 쓰면 안 되는가 ══════════
--
-- 0003의 그 블록은 `insert into credits (user_id, balance) values (new.id, 1)`
-- 이다. 0004 이후로 이건 **신규 가입자에게 크레딧 0편을 주는 것과 같다**:
--
--   - 0004가 `lite_balance`/`pro_balance` 두 컬럼을 도입하고 `balance`를
--     DEPRECATED로 내렸다(0004의 comment 참고).
--   - `begin_translation_job`은 `lite_balance`/`pro_balance`만 차감한다.
--     `balance`는 아무도 읽지 않는다.
--   - 따라서 `balance=1`만 넣으면 두 잔액이 모두 0인 계정이 만들어지고,
--     신규 가입자는 첫 번역에서 곧바로 insufficient_credits를 맞는다.
--
-- 0003의 그 주석 블록은 0004 이전에 쓰인 것이라 이 파일이 대체한다. 0003은
-- 히스토리로 남기되 그 블록은 실행 금지 표시를 달아뒀다.
--
-- 이 마이그레이션은 *앞으로 가입하는* 계정에만 적용된다. 베타 기간에 이미
-- 지급된 크레딧은 회수하지 않는다(decisions.md §1-10의 결정 유지).

create or replace function public.grant_signup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 라이트 1편만. 프로는 결제 오픈과 함께 판매 대상이 되므로 지급하지 않는다.
  -- `balance`(deprecated)는 0으로 둔다 — 0004 이후 아무도 읽지 않는다.
  insert into public.credits (user_id, balance, lite_balance, pro_balance)
  values (new.id, 0, 1, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 트리거 자체는 0001이 만든 것에서 바뀌지 않는다. 함수만 교체하면 되지만,
-- 새 DB에 이 파일 하나만 돌려도 성립하도록 여기서도 다시 선언한다(0004와 동일).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.grant_signup_credit();
