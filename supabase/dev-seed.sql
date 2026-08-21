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
--
-- ⚠️ 2026-08-06 정정 — 2·3·4번은 그 전까지 **deprecated된 `balance` 컬럼**을
--    건드리고 있었다. 0004(티어제) 이후 차감도 조회도 `lite_balance`/
--    `pro_balance`만 보므로, 옛 버전으로 충전하면 화면 숫자도 안 변하고 번역도
--    못 했다(comp-credit.sql이 8-02에 같은 이유로 고쳐졌는데 이 파일은 남아
--    있었다). 아래는 두 컬럼을 직접 다룬다.


-- ═══════════════════════════════════════════════════════════════ 1. 현황 ═══
-- 계정별 잔액과 지금까지 연 job 수. 무엇을 바꾸기 전에 먼저 본다.
-- 이메일 치환이 필요 없는 유일한 블록.

select
  u.email,
  coalesce(c.lite_balance, 0) as lite,
  coalesce(c.pro_balance, 0)  as pro,
  (t.user_id is not null)     as unlimited,
  count(j.id)                 as jobs_opened,
  max(j.created_at)           as last_job,
  u.created_at                as signed_up
from auth.users u
left join public.credits c           on c.user_id = u.id
left join public.unlimited_testers t on t.user_id = u.id
left join public.translation_jobs j  on j.user_id = u.id
group by u.id, u.email, c.lite_balance, c.pro_balance, t.user_id, u.created_at
order by u.created_at desc;


-- ═════════════════════════════════════════════════════════════ 2. 충전 ═══
-- 일회성 테스트용. 반복 테스트라면 충전 대신 7번(무제한 등록)을 쓴다.
-- 번역 1회 = 크레딧 1개다.
--
-- 0행이 갱신되면 credits 행 자체가 없다는 뜻 → 3번을 먼저 실행할 것.

update public.credits
   set lite_balance = 10,
       pro_balance  = 10,
       updated_at   = now()
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');


-- ══════════════════════════════════════════════ 3. 누락된 지급 복구 ═══
-- 가입 트리거(on_auth_user_created)는 0001_credits.sql을 적용한 *뒤에* 가입한
-- 계정에만 걸린다. 마이그레이션 전에 로그인해서 "번역권 0편"으로 보이는 계정은
-- credits 행이 아예 없고, 그러면 2번 update가 0행을 갱신하며 조용히 지나간다.
--
-- 지급량은 0004의 가입 트리거와 같게 맞춘다(라이트 3, 프로 1).

insert into public.credits (user_id, balance, lite_balance, pro_balance)
select id, 0, 3, 1
  from auth.users
 where email = 'YOUR_EMAIL_HERE'
    on conflict (user_id) do nothing;


-- ════════════════════════════════════════════════ 4. 페이월 테스트 ═══
-- 잔액을 0으로 만들어 402 insufficient_credits 경로와 "준비 중" 화면을 확인한다.
--
-- 무제한으로 등록된 계정(7번)에는 효과가 없다 — 차감 자체가 면제라 0편이어도
-- 번역이 열린다. 페이월을 보려면 7번의 회수 블록을 먼저 실행할 것.

update public.credits
   set lite_balance = 0,
       pro_balance  = 0,
       updated_at   = now()
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


-- ═══════════════════════════════════════════ 7. 무제한 테스터 등록/회수 ═══
-- 0013_unlimited_testers.sql이 만든 allowlist. 등록된 계정은
-- begin_translation_job이 차감을 건너뛴다 — 잔액은 0에 머물지만 번역은 계속
-- 열리고, job 행·메트릭·히스토리는 실사용과 똑같이 쌓인다. /api/credits는 이
-- 계정에 UNLIMITED_CREDIT_DISPLAY(999)를 표시용으로 돌려준다.
--
-- ⚠️ 이 블록은 dev-seed의 나머지와 달리 **배포용 DB에 실행해도 되는** 유일한
--    블록이다. 배포된 베타에 로그인해서 테스트하려면 오히려 거기 있어야 한다.
--    단 대상은 운영자 계정으로 한정할 것 — 여기 들어간 계정은 매출 없이 번역을
--    무한히 돌릴 수 있다.

-- 등록
insert into public.unlimited_testers (user_id, note)
select id, '운영자 테스트 계정'
  from auth.users
 where email = 'hello@mut36.com'
    on conflict (user_id) do nothing;

-- 회수 (페이월·소진 화면을 테스트하려면 먼저 이걸 실행)
delete from public.unlimited_testers
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');

-- 현재 등록된 계정 전체
select u.email, t.note, t.created_at
  from public.unlimited_testers t
  join auth.users u on u.id = t.user_id
 order by t.created_at;


-- ═══════════════════════════════════════════════ 8. 쿠폰 발행/회수 ═══
-- 0014_coupons.sql이 만든 표. 코드를 입력한 계정은 unlimited_testers에
-- expires_at과 함께 등록되고, begin_translation_job이 만료 전까지 차감을
-- 건너뛴다.
--
-- ⚠️ 7번과 마찬가지로 **배포용 DB에 실행해도 되는** 블록이다 — 쿠폰은
--    배포된 앱에서 쓰라고 만드는 것이다. 다만 max_redemptions를 반드시
--    적을 것. null로 두면 코드가 새는 순간 인원 상한이 사라진다.

-- 발행
insert into public.coupons (code, duration_days, max_redemptions, note)
values (public.normalize_coupon_code('세르지오'), 30, 10, '지인 배포 2026-08')
    on conflict (code) do nothing;

-- 회수 (지운 게 아니라 끈다 — 이미 쓴 사람의 기간은 그대로 살려 둔다)
update public.coupons set active = false where code = '세르지오';

-- 사용 현황
select c.code, c.redeemed_count, c.max_redemptions, c.active, c.note
  from public.coupons c
 order by c.created_at desc;

-- 누가 언제 썼고 언제까지인가
select u.email, r.code, r.redeemed_at, t.expires_at
  from public.coupon_redemptions r
  join auth.users u on u.id = r.user_id
  left join public.unlimited_testers t on t.user_id = r.user_id
 order by r.redeemed_at desc;

-- 한 사람의 기간을 끊는다 (쿠폰 자체는 그대로)
delete from public.unlimited_testers
 where user_id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
