-- ZAMAK: 개발용 크레딧 조작 스니펫
--
-- ⚠️ 개발 환경 전용. 프로덕션 DB에서 실행하지 말 것 — 결제 없이 잔액을 바꾸므로
--    매출 기록과 어긋난다. 결제가 붙은 뒤에는 환불/지급 경로를 따로 만들어야 한다.
--
-- 사용법
--   1. 이 파일에서 'YOUR_EMAIL_HERE'를 본인 계정 주소로 일괄 치환
--   2. Supabase 대시보드 → SQL Editor에 **필요한 블록만** 붙여넣고 실행
--
-- 통째로 실행하도록 만들어지지 않았다. 블록마다 목적이 다르고 일부는 서로
-- 상충한다(2번 충전 vs 4번 소진). 위에서부터 다 돌리면 잔액이 0이 된다.
--
-- 안전장치: 치환을 깜빡하고 실행해도 아무 일도 일어나지 않는다.
-- 'YOUR_EMAIL_HERE'와 일치하는 계정이 없으면 서브쿼리가 NULL이 되어 어떤 행도
-- 매칭되지 않는다. 1번(조회)만 결과를 낸다.


-- ═══════════════════════════════════════════════════════════════ 1. 현황 ═══
-- 계정별 잔액과 지금까지 연 job 수. 무엇을 바꾸기 전에 먼저 본다.
-- 이메일 치환이 필요 없는 유일한 블록.

select
  u.email,
  coalesce(c.balance, 0) as balance,
  count(j.id)            as jobs_opened,
  max(j.created_at)      as last_job,
  u.created_at           as signed_up
from auth.users u
left join public.credits c          on c.user_id = u.id
left join public.translation_jobs j on j.user_id = u.id
group by u.id, u.email, c.balance, u.created_at
order by u.created_at desc;


-- ═════════════════════════════════════════════════════════════ 2. 충전 ═══
-- 반복 테스트용. THINKING_LEVEL 비교처럼 번역을 여러 번 돌려야 할 때 쓴다.
-- 번역 1회 = 크레딧 1개다.
--
-- 0행이 갱신되면 credits 행 자체가 없다는 뜻 → 3번을 먼저 실행할 것.

update public.credits
   set balance    = 10,
       updated_at = now()
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');


-- ══════════════════════════════════════════════ 3. 누락된 지급 복구 ═══
-- 가입 트리거(on_auth_user_created)는 0001_credits.sql을 적용한 *뒤에* 가입한
-- 계정에만 걸린다. 마이그레이션 전에 로그인해서 "번역권 0편"으로 보이는 계정은
-- credits 행이 아예 없고, 그러면 2번 update가 0행을 갱신하며 조용히 지나간다.

insert into public.credits (user_id, balance)
select id, 1
  from auth.users
 where email = 'YOUR_EMAIL_HERE'
    on conflict (user_id) do nothing;


-- ════════════════════════════════════════════════ 4. 페이월 테스트 ═══
-- 잔액을 0으로 만들어 402 insufficient_credits 경로와 "준비 중" 화면을 확인한다.

update public.credits
   set balance    = 0,
       updated_at = now()
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');


-- ═════════════════════════════════════════════ 5. job 이력 확인 ═══
-- "크레딧이 파일 단위로 빠지는가"를 검증할 때 쓴다. 파일 하나를 번역했으면
-- 청크가 몇 개였든 여기 행은 **하나만** 늘어야 한다.
--
-- expected_chunks는 SERVER_CHUNK_SIZE(125) 기준 추정이다. 서버 로그의
-- [gemini] 줄 개수와 맞아야 하고, job 행 수와는 맞으면 안 된다.

select
  j.created_at,
  u.email,
  j.total_blocks,
  ceil(j.total_blocks::numeric / 125) as expected_chunks
from public.translation_jobs j
join auth.users u on u.id = j.user_id
order by j.created_at desc
limit 20;


-- ══════════════════════════════════════════════════ 6. job 이력 초기화 ═══
-- 크레딧은 건드리지 않는다.
--
-- auth.users는 지우지 않는다 — 지우면 Google 재로그인 시 새 계정이 되고 가입
-- 트리거가 다시 돌아 크레딧이 1개 더 생긴다. 그건 초기화가 아니라 우회다.

delete from public.translation_jobs
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
