-- ZAMAK: 계정별 월간 API 사용량 (저장해두고 필요할 때 실행)
--
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행할 것. translation_chunk_usage는
--    RLS로 "본인 행만" 읽히므로 앱에서는 이 집계가 구조적으로 불가능하다.
--    대시보드는 service role로 돌아 RLS를 우회한다. (daily.sql과 같은 이유)
--
-- 원본: `translation_chunk_usage`(0009) — 모델 호출 1건당 1행. 여기에는
--   phase='main'  번역 본 pass
--   phase='sweep' 복구 스윕
--   phase='note'   연출 메모 프리패스 (0017부터. job_id가 null이다)
--   phase='polish' 규칙 적용 (0017부터. 청크마다 한 행, job_id가 null이다)
-- 가 함께 들어 있다. 실패한 호출도 행으로 남지만 토큰은 0이라 금액에 영향이 없다.
--
-- ── 월 경계에 대하여 ─────────────────────────────────────────────────────
-- 아래 집계는 **KST 기준 매월 1일 00:00**에 끊긴다. 이건 구글 청구서의 월
-- 경계(태평양시)와 며칠 시차가 아니라 몇 시간 어긋난다 — 1일 새벽에 돌린
-- 번역은 이 표와 청구서에서 다른 달로 갈 수 있다. 경향을 보는 데는 문제가
-- 없지만 청구서와 원 단위로 맞추려는 목적이라면 시간대를 'America/Los_Angeles'
-- 로 바꿔서 다시 돌릴 것.
--
-- 단가는 docs/tuning/cost-per-block.md의 표를 그대로 옮겼다. 단가가 바뀌면
-- 아래 rates를 고친다 — 모르는 모델은 단가가 null로 남고 `단가없음` 열에
-- 호출 수가 찍힌다(조용히 0원으로 세지 않는다).

with rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),   -- 빠른번역
    ('gemini-3.1-pro-preview',  2.00, 12.00),  -- 고급번역
    ('gpt-5.6-luna',            1.00, 6.00)    -- 연출 메모 (기본 provider)
),
usd as (
  select
    date_trunc('month', u.created_at at time zone 'Asia/Seoul')::date as 월,
    u.user_id,
    u.model,
    u.phase,
    u.ok,
    u.blocks,
    u.prompt_tokens,
    u.thoughts_tokens,
    u.output_tokens,
    r.in_per_1m,
    -- thinking은 출력 단가로 과금된다 (docs/tuning/cost-per-block.md §비용식)
    (u.prompt_tokens * r.in_per_1m
     + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0 as 달러
  from public.translation_chunk_usage u
  left join rates r on r.model = u.model
)
select
  월,
  au.email                                          as 계정,
  count(*)                                          as 호출수,
  count(*) filter (where phase = 'note')            as 메모호출,
  count(*) filter (where phase = 'polish')          as 규칙적용호출,
  count(*) filter (where not ok)                    as 실패,
  count(*) filter (where in_per_1m is null)         as 단가없음,
  sum(blocks) filter (where phase in ('main', 'sweep')) as 번역블록,
  sum(prompt_tokens)                                as 입력토큰,
  sum(thoughts_tokens)                              as 사고토큰,
  sum(output_tokens)                                as 출력토큰,
  round(sum(달러)::numeric, 4)                      as 달러,
  -- 1 USD = 1,688원은 환율이 아니라 실청구액 역산치다 (cost-per-block.md)
  round(sum(달러)::numeric * 1688, 0)               as 원
from usd
join auth.users au on au.id = usd.user_id
group by 1, 2
order by 1 desc, 원 desc nulls last;


-- ── 같은 달을 모델별로 쪼개 보고 싶을 때 ─────────────────────────────────
-- 위 쿼리의 group by를 1,2,model로 바꾸고 select에 model을 넣으면 된다.
-- "메모가 전체 청구액의 몇 %인가"는 이 각도에서만 보인다.


-- ══════════════════════════════ 한 계정 · 한 달 얼마 썼나 ═════════════════════
--
-- 아래 두 값만 고쳐서 실행한다. 월은 **그 달의 1일**을 적는다(KST 기준이며,
-- 위 주석의 월 경계 이야기가 그대로 적용된다).
--
--   계정 → 'someone@example.com'
--   월   → '2026-08-01'
--
-- 한 줄이 나온다: 그 계정이 그 달에 쓴 달러. 모델별로 쪼갠 내역이 그 아래
-- 두 번째 쿼리로 따라 나온다 — 총액만 보고 "왜 이렇게 나왔지"를 물을 때
-- 답이 있는 자리가 있어야 한다.

with 조건 as (
  select
    'someone@example.com'::text as 계정,
    '2026-08-01'::date          as 월
),
rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),
    ('gemini-3.1-pro-preview',  2.00, 12.00),
    ('gpt-5.6-luna',            1.00, 6.00)
),
행 as (
  select
    u.model,
    u.phase,
    u.ok,
    u.blocks,
    u.prompt_tokens,
    u.thoughts_tokens,
    u.output_tokens,
    r.in_per_1m,
    (u.prompt_tokens * r.in_per_1m
     + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0 as 달러
  from public.translation_chunk_usage u
  join auth.users au on au.id = u.user_id
  join 조건 c on true
  left join rates r on r.model = u.model
  where au.email = c.계정
    and u.created_at >= (c.월::timestamp at time zone 'Asia/Seoul')
    and u.created_at <  ((c.월 + interval '1 month')::timestamp at time zone 'Asia/Seoul')
)
select
  (select 계정 from 조건)                       as 계정,
  (select to_char(월, 'YYYY-MM') from 조건)     as 월,
  count(*)                                      as 호출수,
  count(*) filter (where not ok)                as 실패,
  count(*) filter (where in_per_1m is null)     as 단가없음,
  round(coalesce(sum(달러), 0)::numeric, 4)     as 달러,
  round(coalesce(sum(달러), 0)::numeric * 1688, 0) as 원
from 행;

-- 같은 조건, 모델·단계별 내역.
with 조건 as (
  select
    'someone@example.com'::text as 계정,
    '2026-08-01'::date          as 월
),
rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),
    ('gemini-3.1-pro-preview',  2.00, 12.00),
    ('gpt-5.6-luna',            1.00, 6.00)
)
select
  u.model                                       as 모델,
  u.phase                                       as 단계,
  count(*)                                      as 호출수,
  sum(u.prompt_tokens)                          as 입력토큰,
  sum(u.thoughts_tokens)                        as 사고토큰,
  sum(u.output_tokens)                          as 출력토큰,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric, 4) as 달러
from public.translation_chunk_usage u
join auth.users au on au.id = u.user_id
join 조건 c on true
left join rates r on r.model = u.model
where au.email = c.계정
  and u.created_at >= (c.월::timestamp at time zone 'Asia/Seoul')
  and u.created_at <  ((c.월 + interval '1 month')::timestamp at time zone 'Asia/Seoul')
group by 1, 2
order by 달러 desc nulls last;
