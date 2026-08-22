-- ZAMAK: 아침 1분 퍼널 (저장해두고 매일 아침 실행)
--
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행할 것. beta_events·translation_jobs는
--    RLS로 "본인 행만" 읽히므로 앱에서는 이 집계가 구조적으로 불가능하다.
--    대시보드는 service role로 돌아 RLS를 우회한다.
--
-- 5개 숫자, 두 줄(어제 / 최근 7일). 어제 한 줄만 보면 잡음이고,
-- 7일과 나란히 봐야 "오늘이 이상한가"를 1초에 판단할 수 있다.
--
-- 정의 (왜 이렇게 셌는지는 아래 주석 참조):
--   신규가입 — auth.users.created_at
--   로그인   — auth.users.last_sign_in_at (마지막 로그인만 남으므로 재방문의 근사치)
--   업로드   — translation_jobs 생성 = 크레딧 1개 차감 = "진짜 시작한 사람"
--   완료     — translation_jobs.completed_at = 결과물이 남은 런
--   재방문   — 이 기간에 번역했고, 그 이전에도 번역한 적 있는 사람
--
-- 빠진 하나: **방문**. beta_events.user_id가 NOT NULL(0009)이라 익명 방문자는
-- 구조적으로 이 테이블에 못 들어간다. 방문 수는 Vercel Analytics에서 보거나,
-- 정말 SQL 한 줄에 넣고 싶으면 user_id nullable인 별도 테이블이 필요하다.
-- 지금은 "신규가입"을 퍼널의 첫 칸으로 쓰는 게 정직하다.

with 기간 as (
  select
    '어제'::text as 구간,
    1            as 순서,
    (((now() at time zone 'Asia/Seoul')::date - 1)::timestamp at time zone 'Asia/Seoul') as 시작,
    (( (now() at time zone 'Asia/Seoul')::date     )::timestamp at time zone 'Asia/Seoul') as 끝
  union all
  select
    '최근7일',
    2,
    (((now() at time zone 'Asia/Seoul')::date - 7)::timestamp at time zone 'Asia/Seoul'),
    (( (now() at time zone 'Asia/Seoul')::date     )::timestamp at time zone 'Asia/Seoul')
)
select
  p.구간,

  (select count(*) from auth.users u
    where u.created_at >= p.시작 and u.created_at < p.끝)          as 신규가입,

  (select count(*) from auth.users u
    where u.last_sign_in_at >= p.시작 and u.last_sign_in_at < p.끝) as 로그인,

  (select count(distinct j.user_id) from public.translation_jobs j
    where j.created_at >= p.시작 and j.created_at < p.끝)          as 업로드,

  (select count(distinct j.user_id) from public.translation_jobs j
    where j.completed_at >= p.시작 and j.completed_at < p.끝)      as 완료,

  (select count(*) from (
      select j.user_id
        from public.translation_jobs j
       where j.created_at >= p.시작 and j.created_at < p.끝
         and exists (
           select 1 from public.translation_jobs j2
            where j2.user_id = j.user_id
              and j2.created_at < p.시작)
       group by j.user_id) r)                                      as 재방문

from 기간 p
order by p.순서;


-- ─────────────────────────────────────────────────────────────────────────
-- 숫자가 이상할 때만 내려가는 곳 (평소엔 실행하지 않는다)
--
--   업로드는 있는데 완료가 적다   → supabase/beta-review.sql 2번 (실패한 런)
--   가입은 있는데 업로드가 없다   → beta-review.sql 5번 (업로드 거절 사유)
--   완료는 있는데 재방문이 없다   → beta-review.sql 4번 (서술 피드백)
--   전부 0이다                    → 배포 사고를 의심. 0011 error 테이블 확인.
