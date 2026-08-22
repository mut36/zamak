-- ZAMAK: API 사용량과 그 가격 (저장해두고 필요할 때 실행)
--
-- ⚠️ Supabase 대시보드 SQL Editor에서 실행할 것. translation_chunk_usage는
--    RLS로 "본인 행만" 읽히므로 앱에서는 이 집계가 구조적으로 불가능하다.
--    대시보드는 service role로 돌아 RLS를 우회한다. (daily.sql과 같은 이유)
--
-- 두 개뿐이다: **누적**(1)과 **월별**(2). 각각 총액 한 줄 뒤에 모델·단계별
-- 내역이 따라온다 — 총액만 보고 "왜 이렇게 나왔지"를 물을 때 답이 있는 자리가
-- 있어야 한다.
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
-- rates를 **네 곳 모두** 고친다. 모르는 모델은 단가가 null로 남고 `단가없음`
-- 열에 호출 수가 찍힌다 — 조용히 0원으로 세지 않는다.
-- thinking은 출력 단가로 과금된다(cost-per-block.md §비용식).
-- 1 USD = 1,688원은 환율이 아니라 실청구액 역산치다.
--
-- ── 월 경계 ─────────────────────────────────────────────────────────────
-- 아래 월별 집계는 **KST 매월 1일 00:00**에 끊긴다. 구글 청구서의 월 경계는
-- 태평양시라 몇 시간 어긋난다 — 1일 새벽에 돌린 번역은 이 표와 청구서에서
-- 다른 달로 갈 수 있다. 청구서와 원 단위로 맞추려면 'Asia/Seoul'을
-- 'America/Los_Angeles'로 바꿔 다시 돌릴 것.


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
