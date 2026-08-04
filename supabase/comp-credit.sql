-- ZAMAK: 수동 번역권 지급 (베타 기간용)
--
-- 두 가지 요청을 같은 스니펫으로 처리한다:
--   1. "번역권 더 필요해요" — 결제가 아직 안 열려서(토스 가맹점 심사 대기 중)
--      hello@mut36.com으로 들어오는 콤프 지급.
--   2. **실패한 번역의 번역권 복구** — 우리 쪽 문제로 결과물을 못 받은 런.
--      약관이 이미 복구를 약속하고 있고(§1-7 후속), 완료 실패 화면도 그렇게
--      안내한다(`COPY.error.creditNote`). 자동 환불은 베타 범위 밖이라
--      (`docs/TODO.md` "크레딧 환불 정책") 당분간 이 파일이 그 경로다.
--
-- dev-seed.sql과 달리 이 파일은 프로덕션 SQL Editor에서 실행해도 된다.
--
-- ⚠️ 2026-08-02 정정 — 이 파일은 그 전까지 **deprecated된 `balance` 컬럼**에
--    지급하고 있었다. 0004(티어제)가 `lite_balance`/`pro_balance`를 도입하면서
--    `begin_translation_job`은 그 둘만 차감하고 `balance`는 아무도 읽지 않는다.
--    즉 옛 버전으로 지급하면 **조회 화면의 숫자도 안 변하고 번역도 못 한다**
--    (`/api/credits`가 읽는 것도 lite/pro 두 컬럼이다). 아래는 두 컬럼에
--    직접 지급한다.
--
-- 사용법
--   1. 'YOUR_EMAIL_HERE'를 대상 계정 주소로 일괄 치환
--   2. 지급 블록에서 라이트/프로 편수를 정한다 — 안 줄 쪽은 0으로
--   3. Supabase 대시보드 → SQL Editor에 붙여넣고 실행
--   4. 조회 블록으로 반영 확인
--
-- 안전장치: 이메일 치환을 깜빡해도 일치하는 계정이 없어 0행이 갱신되고 끝난다.
-- **더하기**라서 실수로 두 번 눌러도 잔액이 지워지지 않는다(두 번 더해질 뿐이니
-- 요청당 한 번만 실행할 것).
--
-- 결제가 붙은 뒤에는 이 경로로 지급한 크레딧에 대응하는 orders 행이 없다 —
-- 의도된 것이다(콤프 지급이지 결제가 아니므로). 매출 집계 시 감안할 것.

-- ═══════════════════════════════════════════════════════════ 지급 전 확인 ═══
select
  u.email,
  coalesce(c.lite_balance, 0) as lite,
  coalesce(c.pro_balance, 0)  as pro
from auth.users u
left join public.credits c on c.user_id = u.id
where u.email = 'YOUR_EMAIL_HERE';


-- ═══════════════════════════════════════════════════════════════ 지급 ═══
-- 가입 트리거 이전 계정 등 credits 행이 아예 없는 경우까지 한 번에 처리한다.
-- `balance`(deprecated)는 0으로 둔다 — 0004 이후 아무도 읽지 않는다.
--
-- 지급량은 아래 **한 곳**에서만 정한다. insert 값과 update 값이 갈라지면
-- "신규 계정과 기존 계정에 서로 다른 편수가 나가는" 버그가 되므로, CTE로
-- 묶어 두 자리가 같은 값을 보게 했다.

with grant_amount as (
  select
    1 as lite,  -- 지급할 라이트 편수
    0 as pro    -- 지급할 프로 편수
)
insert into public.credits (user_id, balance, lite_balance, pro_balance)
select u.id, 0, g.lite, g.pro
  from auth.users u
 cross join grant_amount g
 where u.email = 'YOUR_EMAIL_HERE'
on conflict (user_id) do update
   set lite_balance = public.credits.lite_balance + excluded.lite_balance,
       pro_balance  = public.credits.pro_balance  + excluded.pro_balance,
       updated_at   = now();


-- ═══════════════════════════════════════════════════════════ 지급 후 확인 ═══
select u.email, c.lite_balance, c.pro_balance, c.updated_at
  from auth.users u
  join public.credits c on c.user_id = u.id
 where u.email = 'YOUR_EMAIL_HERE';


-- ═════════════════════════════════════════ 복구 대상 찾기 (실패한 런 조회) ═══
-- "번역이 실패했어요"라는 제보를 받았을 때, 그 계정의 최근 런 중 결과물이
-- 없는 것을 먼저 확인한다. `completed_at`이 비어 있으면 record_job_result가
-- 한 번도 못 돌았다는 뜻 — 즉 사용자 손에 파일이 안 갔다.
--
-- `fallback_blocks`가 큰 런(결과물은 있지만 상당수가 원문 그대로)도 같이
-- 보인다. 어디까지를 복구 대상으로 볼지는 아직 정책이 없다(TODO 참고) —
-- 지금은 이 숫자를 보고 사람이 판단한다.

select
  j.created_at,
  j.source_filename,
  j.model,
  j.total_blocks,
  j.completed_at,
  j.stop_reason,
  j.failed_chunks,
  j.fallback_blocks,
  case when j.completed_at is null then '결과물 없음' else '결과물 있음' end as status
from public.translation_jobs j
join auth.users u on u.id = j.user_id
where u.email = 'YOUR_EMAIL_HERE'
order by j.created_at desc
limit 20;


-- ═══════════════ 피드백 이벤트: 카톡·이메일 문의 → 프로 1개 (2026-08) ═══
--
-- 오픈카톡이나 hello@mut36.com으로 의견을 남긴 사람에게 프로 번역권 1개.
-- 인앱 피드백(별점/후속설문)은 `/api/feedback`이 자동 지급하므로(0012의
-- grant_event_credit) 이 섹션은 그 경로를 안 타는 카톡·이메일 문의 전용이다.
--
-- 위 콤프 지급 섹션과 달리 event_grants(0012)에 기록을 남긴다 — 이벤트
-- 보상은 "1인 1회"가 지켜져야 하므로, 이미 받은 사람은 아래 insert가 0행으로
-- 끝나고 update도 안 돈다. 실수로 두 번 실행해도 두 번째부터는 아무 일도
-- 안 일어난다(콤프 섹션의 "더하기라 두 번 눌러도 안전"과 다르게, 여기는
-- 애초에 두 번째 실행이 무해가 아니라 무동작이다).
--
-- 사용법: 'YOUR_EMAIL_HERE'를 문의자가 남긴 가입 이메일로 치환 후 전체 실행.

with target as (
  select id from auth.users where email = 'YOUR_EMAIL_HERE'
),
grant_attempt as (
  insert into public.event_grants (user_id, event_code)
  select id, 'feedback_reward_kakao_email' from target
  on conflict (user_id, event_code) do nothing
  returning user_id
)
update public.credits
   set pro_balance = pro_balance + 1,
       updated_at  = now()
 where user_id in (select user_id from grant_attempt);

-- 확인: granted_at이 채워져 있으면 지급된 것(이번 실행이든 이전 실행이든).
-- 행 자체가 없으면 이메일이 안 맞는 것이다.
select
  u.email,
  eg.granted_at,
  c.pro_balance
from auth.users u
left join public.event_grants eg
  on eg.user_id = u.id and eg.event_code = 'feedback_reward_kakao_email'
left join public.credits c on c.user_id = u.id
where u.email = 'YOUR_EMAIL_HERE';
