-- ZAMAK: 수동 크레딧 지급 (베타 기간용)
--
-- 결제가 아직 안 열려서(토스 가맹점 심사 대기 중) hello@mut36.com으로 들어오는
-- "번역권 더 필요해요" 요청을 처리하는 용도. dev-seed.sql과 달리 이 파일은
-- 프로덕션 SQL Editor에서 실행해도 된다.
--
-- dev-seed.sql의 2번(`set balance = 10`)을 그대로 쓰지 말 것 — 그건 잔액을
-- **덮어쓰기**라서 이미 크레딧이 남은 계정에 실수로 돌리면 기존 잔액이 사라진다.
-- 아래는 **더하기**라서 실수로 두 번 눌러도 두 번 더해질 뿐 잔액을 지우지 않는다
-- (두 번 더해지는 것 자체는 막지 않으니, 요청당 한 번만 실행할 것).
--
-- 사용법
--   1. 'YOUR_EMAIL_HERE'와 3(지급할 편수)을 원하는 값으로 바꾼다 — 두 군데(지급
--      블록 안의 select 리터럴과 balance = balance + 3)를 같은 값으로 맞출 것
--   2. Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--   3. 조회 블록으로 반영 확인
--
-- 안전장치: 이메일 치환을 깜빡해도 일치하는 계정이 없어 0행이 갱신되고 끝난다.
--
-- 결제가 붙은 뒤에는 이 경로로 지급한 크레딧에는 대응하는 orders 행이 없다 —
-- 의도된 것이다(콤프 지급이지 결제가 아니므로). 매출 집계 시 이 사실을 감안할 것.

-- ═══════════════════════════════════════════════════════════ 지급 전 확인 ═══
select u.email, coalesce(c.balance, 0) as balance
  from auth.users u
  left join public.credits c on c.user_id = u.id
 where u.email = 'YOUR_EMAIL_HERE';


-- ═══════════════════════════════════════════════════════════════ 지급 ═══
-- 가입 트리거 이전 계정 등 credits 행이 아예 없는 경우까지 한 번에 처리한다.

insert into public.credits (user_id, balance)
select id, 3 -- 지급할 편수. 신규 계정(credits 행 없음)일 때 쓰이는 값.
  from auth.users
 where email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do update
   -- 기존 계정일 때 쓰이는 값 — 위와 같은 수로 맞출 것.
   set balance    = public.credits.balance + 3,
       updated_at = now();


-- ═══════════════════════════════════════════════════════════ 지급 후 확인 ═══
select u.email, c.balance, c.updated_at
  from auth.users u
  join public.credits c on c.user_id = u.id
 where u.email = 'YOUR_EMAIL_HERE';
