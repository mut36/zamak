-- ZAMAK: API 사용량과 그 가격 (저장해두고 필요할 때 실행)
--
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행할 것. translation_chunk_usage는
--    RLS로 "본인 행만" 읽히므로 앱에서는 이 집계가 구조적으로 불가능하다.
--    대시보드는 service role로 돌아 RLS를 우회한다. (daily.sql과 같은 이유)
--
-- 세 벌이다. 평소에 보는 것은 **0번(계정별)** 하나고, 1·2번은 구글 청구서와
-- 대조할 때 쓰는 전체 합계다. 계산식·단가·월 경계는 셋이 완전히 같다 — 같은
-- 파일 안에서 다른 규칙으로 더하면 두 숫자가 어긋나고, 그때 어느 쪽이 맞는지
-- 알 방법이 없어진다.
--
-- 원본: `translation_chunk_usage`(0009) — 모델 호출 1건당 1행.
--   phase='main'   번역 본 pass
--   phase='sweep'  복구 스윕
--   phase='note'   연출 메모 프리패스 (0017부터. job_id가 null이다)
--   phase='polish' 규칙 적용 (0017부터. 청크마다 한 행, job_id가 null이다)
-- 실패한 호출도 행으로 남지만 토큰이 0이라 금액에 영향이 없다.
--
-- ── 단가 ────────────────────────────────────────────────────────────────
-- docs/tuning/cost-per-block.md의 표를 그대로 옮겼다. 단가가 바뀌면 아래
-- rates를 **다섯 곳 모두** 고친다. 모르는 모델은 단가가 null로 남고 `단가없음`
-- 열에 호출 수가 찍힌다 — 조용히 0원으로 세지 않는다.
-- thinking은 출력 단가로 과금된다(cost-per-block.md §비용식).
-- 1 USD = 1,688원은 환율이 아니라 실청구액 역산치다.
--
-- ── 월 경계 ─────────────────────────────────────────────────────────────
-- 아래 월별 집계는 **KST 매월 1일 00:00**에 끊긴다. 구글 청구서의 월 경계는
-- 태평양시라 몇 시간 어긋난다 — 1일 새벽에 돌린 번역은 이 표와 청구서에서
-- 다른 달로 갈 수 있다. 청구서와 원 단위로 맞추려면 'Asia/Seoul'을
-- 'America/Los_Angeles'로 바꿔 다시 돌릴 것.


-- ═════════════════════ 0. 계정별 — 월 하나 넣으면 전 계정이 한 줄씩 ═══════════
--
-- **여기만 값을 고친다.** 그 달의 1일을 적는다(KST 기준):
--
--     '2026-08-01'
--
-- 한 계정당 한 줄. 그 달에 아무것도 안 쓴 계정도 0으로 나온다 — 가입만 하고
-- 안 쓴 사람이 표에서 사라지면 "이 달 사용자 수"를 이 표로 셀 수 없다.
-- 누적 두 열은 월과 무관한 전체 기간 값이라, "이번 달만 튄 사람"과 "원래
-- 많이 쓰는 사람"이 한 줄에서 구별된다.
--
-- 번역횟수는 job 개수(= 파일 수)다. 메모·규칙 적용은 job_id가 null이라 여기
-- 안 잡힌다 — 의도한 것이다. "몇 편 번역했나"에 프리패스가 섞이면 안 된다.
-- 대신 그 호출들의 토큰과 금액은 나머지 열에 전부 포함된다.

with 조건 as (
  select '2026-08-01'::date as 월
),
rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),   -- 빠른번역
    ('gemini-3.1-pro-preview',  2.00, 12.00),  -- 고급번역
    ('gpt-5.6-luna',            1.00, 6.00)    -- 연출 메모 (기본 provider)
),
행 as (
  select
    u.user_id,
    u.job_id,
    u.ok,
    u.prompt_tokens + u.thoughts_tokens + u.output_tokens as 토큰,
    r.in_per_1m,
    (u.prompt_tokens * r.in_per_1m
     + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0 as 달러,
    -- 이 행이 지정한 달에 속하는가. 아래 filter가 전부 이 한 칸을 본다.
    (u.created_at >= (c.월::timestamp at time zone 'Asia/Seoul')
     and u.created_at < ((c.월 + interval '1 month')::timestamp at time zone 'Asia/Seoul')) as 이번달
  from public.translation_chunk_usage u
  join 조건 c on true
  left join rates r on r.model = u.model
)
select
  au.email                                                        as 계정,
  count(distinct 행.job_id) filter (where 행.이번달)               as 번역횟수,
  count(*) filter (where 행.이번달 and not 행.ok)                  as 실패,
  coalesce(sum(행.토큰) filter (where 행.이번달), 0)               as 월_토큰,
  round(coalesce(sum(행.달러) filter (where 행.이번달), 0)::numeric, 4) as 월_달러,
  coalesce(sum(행.토큰), 0)                                        as 누적_토큰,
  round(coalesce(sum(행.달러), 0)::numeric, 4)                     as 누적_달러,
  -- 0이 아니면 그 줄의 금액은 믿지 말 것 — rates에 없는 모델이 섞였다는 뜻이다.
  -- count(*)가 아니라 count(행.user_id)인 이유: 사용 이력이 없는 계정은 left
  -- join이 전부 null인 행 하나를 만들고, count(*)로 세면 그 빈 행이
  -- "단가없음 1건"으로 둔갑한다. count(컬럼)은 null을 세지 않는다.
  count(행.user_id) filter (where 행.in_per_1m is null)             as 단가없음
from auth.users au
left join 행 on 행.user_id = au.id
group by au.id, au.email
order by 월_달러 desc, 누적_달러 desc;


-- ═══════════════════════════════════ 1. 누적 — 지금까지 전부 ════════════════

with rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),   -- 빠른번역
    ('gemini-3.1-pro-preview',  2.00, 12.00),  -- 고급번역
    ('gpt-5.6-luna',            1.00, 6.00)    -- 연출 메모 (기본 provider)
)
select
  min(u.created_at at time zone 'Asia/Seoul')::date  as 첫호출,
  max(u.created_at at time zone 'Asia/Seoul')::date  as 마지막호출,
  count(*)                                           as 호출수,
  count(*) filter (where not u.ok)                   as 실패,
  count(*) filter (where r.in_per_1m is null)        as 단가없음,
  sum(u.prompt_tokens)                               as 입력토큰,
  sum(u.thoughts_tokens)                             as 사고토큰,
  sum(u.output_tokens)                               as 출력토큰,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric, 4) as 달러,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric * 1688, 0) as 원
from public.translation_chunk_usage u
left join rates r on r.model = u.model;


-- 1-b. 누적을 모델·단계별로. "메모와 규칙 적용이 전체의 몇 %인가"는 여기서만 보인다.
with rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),
    ('gemini-3.1-pro-preview',  2.00, 12.00),
    ('gpt-5.6-luna',            1.00, 6.00)
)
select
  u.model                                            as 모델,
  u.phase                                            as 단계,
  count(*)                                           as 호출수,
  sum(u.prompt_tokens)                               as 입력토큰,
  sum(u.thoughts_tokens)                             as 사고토큰,
  sum(u.output_tokens)                               as 출력토큰,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric, 4) as 달러,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric * 1688, 0) as 원
from public.translation_chunk_usage u
left join rates r on r.model = u.model
group by 1, 2
order by 달러 desc nulls last;


-- ═══════════════════════════════════ 2. 월별 ═══════════════════════════════
--
-- 한 달에 한 줄, 최근 달이 위. 누적과 달리 여기서만 "이번 달이 지난 달보다
-- 많은가"가 보인다.

with rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),
    ('gemini-3.1-pro-preview',  2.00, 12.00),
    ('gpt-5.6-luna',            1.00, 6.00)
)
select
  to_char(date_trunc('month', u.created_at at time zone 'Asia/Seoul'), 'YYYY-MM') as 월,
  count(*)                                           as 호출수,
  count(*) filter (where not u.ok)                   as 실패,
  count(*) filter (where r.in_per_1m is null)        as 단가없음,
  sum(u.prompt_tokens)                               as 입력토큰,
  sum(u.thoughts_tokens)                             as 사고토큰,
  sum(u.output_tokens)                               as 출력토큰,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric, 4) as 달러,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric * 1688, 0) as 원
from public.translation_chunk_usage u
left join rates r on r.model = u.model
group by 1
order by 1 desc;


-- 2-b. 월 × 모델. 어느 달에 무엇이 튀었는지.
with rates(model, in_per_1m, out_per_1m) as (
  values
    ('gemini-3.6-flash',        1.50, 7.50),
    ('gemini-3.1-pro-preview',  2.00, 12.00),
    ('gpt-5.6-luna',            1.00, 6.00)
)
select
  to_char(date_trunc('month', u.created_at at time zone 'Asia/Seoul'), 'YYYY-MM') as 월,
  u.model                                            as 모델,
  u.phase                                            as 단계,
  count(*)                                           as 호출수,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric, 4) as 달러,
  round(sum((u.prompt_tokens * r.in_per_1m
    + (u.thoughts_tokens + u.output_tokens) * r.out_per_1m) / 1000000.0)::numeric * 1688, 0) as 원
from public.translation_chunk_usage u
left join rates r on r.model = u.model
group by 1, 2, 3
order by 1 desc, 달러 desc nulls last;
