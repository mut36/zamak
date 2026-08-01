-- ZAMAK: 베타 결산 쿼리
--
-- 베타가 답하기로 한 두 질문에 각각 대응한다:
--   A. 번역 품질이 쓸 만한가       → 1·2·3·4번
--   B. 돈을 낼 만한가              → 5·6번
--   원가가 예상대로인가            → 7번
--
-- ⚠️ **Supabase 대시보드 SQL Editor에서 실행할 것.** 모든 테이블이 RLS로
--    "본인 행만" 읽히게 돼 있어서(0005·0009 정책), 앱을 통해서는 이 집계가
--    구조적으로 불가능하다. 대시보드는 service role로 도므로 RLS를 우회한다.
--
-- 블록마다 독립이다. 통째로 실행하지 말고 보고 싶은 블록만 실행할 것.
--
-- 표본이 30명이라는 걸 잊지 말 것 — 아래 비율은 방향을 보는 용도지
-- 유의성을 주장할 수 있는 수가 아니다.


-- ═══════════════════════════════════════════════ 1. 퍼널 — 어디서 새는가 ═══
-- 가입 → 업로드 성공 → 번역 시작 → 결과물 도달 → 다운로드.
--
-- `settings_confirmed`(시작 누름)와 `completed_at`(결과물 남음)의 차이가
-- **실패율**이다. 이 숫자가 크면 2번(중단 사유)으로 내려가서 원인을 본다.
--
-- 업로드 성공에 해당하는 이벤트는 일부러 없다 — 성공한 업로드는 곧
-- settings_confirmed로 이어지고, 실패한 것만 upload_rejected로 남는다
-- (0009 헤더의 "다른 곳에 흔적이 남는 건 이벤트로 안 만든다" 규칙).

select
  (select count(*) from auth.users)                                    as 가입자,
  (select count(distinct user_id) from public.beta_events
    where event = 'upload_rejected')                                   as 업로드_거절_경험,
  (select count(distinct user_id) from public.translation_jobs)        as 번역_시작한_사람,
  (select count(*) from public.translation_jobs)                       as 시작된_런,
  (select count(*) from public.translation_jobs
    where completed_at is not null)                                    as 결과물_생긴_런,
  (select count(distinct user_id) from public.beta_events
    where event = 'download_clicked')                                  as 다운로드한_사람,
  (select count(distinct user_id) from public.beta_events
    where event = 'credits_exhausted_shown')                           as 크레딧_소진한_사람;


-- ══════════════════════════════════════ 2. 실패한 런 — 무엇이 잘못됐는가 ═══
-- 결과물이 안 남은 런과, 남았지만 상당 부분이 원문 그대로인 런.
-- `stop_reason`은 치명적 오류(할당량·인증)로 중간에 멈춘 경우에만 찬다.
--
-- 여기 잡히는 계정은 번역권 복구 대상 후보다 → supabase/comp-credit.sql

select
  case
    when j.completed_at is null then '결과물 없음(전체 실패 또는 이탈)'
    when coalesce(j.fallback_blocks, 0) = 0 then '정상'
    when j.fallback_blocks::numeric / nullif(j.total_blocks, 0) >= 0.05
      then '원문 잔존 5% 이상'
    else '원문 잔존 5% 미만'
  end                                as 결과,
  j.stop_reason                      as 중단사유,
  count(*)                           as 런,
  round(avg(j.fallback_blocks), 1)   as 평균_원문잔존줄,
  round(avg(j.duration_ms) / 1000.0, 1) as 평균_소요초
from public.translation_jobs j
group by 1, 2
order by 3 desc;


-- ═════════════════════════════ 3. 원문 잔존 분포 — 환불 정책의 근거 숫자 ═══
-- `docs/TODO.md`의 "크레딧 환불 정책"이 기다리던 실측이다. (a) 그대로 둔다
-- (b) 일정 비율 넘으면 자동 환불 — 이 분포를 보고 고른다.
--
-- 0줄에 몰려 있으면 (a)가 맞고, 꼬리가 길면 (b)의 임계값을 여기서 읽는다.

select
  case
    when coalesce(fallback_blocks, 0) = 0 then '0줄'
    when fallback_blocks <= 5   then '1–5줄'
    when fallback_blocks <= 20  then '6–20줄'
    when fallback_blocks <= 100 then '21–100줄'
    else '100줄 초과'
  end                                                   as 원문잔존,
  count(*)                                              as 런,
  round(100.0 * count(*) / sum(count(*)) over (), 1)    as 비율_퍼센트
from public.translation_jobs
where completed_at is not null
group by 1
order by min(coalesce(fallback_blocks, 0));


-- ══════════════════════════════════════ 4. 품질 피드백 — 별점과 실사용 여부 ═══
-- 별점은 완료 화면에서, usability는 6시간 뒤 재방문에서 받는다(0009).
-- 둘 다 선택이라 표본 수(`n`)를 항상 같이 볼 것 — 5점 평균도 n=2면 의미 없다.

-- 4-a. 한눈에
select
  count(*)                                              as 피드백_행,
  count(rating)                                         as 별점_응답,
  round(avg(rating), 2)                                 as 평균_별점,
  count(usability)                                      as 실사용_응답,
  count(*) filter (where followup_dismissed_at is not null) as 팔로업_닫음
from public.feedback;

-- 4-b. 실사용 여부 분포 — 베타에서 가장 결정적인 답
select
  usability                                             as 실사용,
  count(*)                                              as 응답,
  round(100.0 * count(*) / sum(count(*)) over (), 1)    as 비율_퍼센트
from public.feedback
where usability is not null
group by 1
order by array_position(
  array['as-is', 'minor-edits', 'major-edits', 'unusable'], usability);

-- 4-c. 문제 유형 — 각 값이 파이프라인의 서로 다른 파일에 대응한다
--      (오역→프롬프트, 존댓말→글로사리, 타이밍→adjustSubtitleTiming …)
select
  kind                                                  as 문제유형,
  count(*)                                              as 지목수
from public.feedback f, unnest(f.issue_kinds) as kind
group by 1
order by 2 desc;

-- 4-d. 자유 코멘트 전문 — 수가 적으니 집계하지 말고 다 읽을 것
select f.created_at, f.rating, f.usability, f.comment, j.source_filename
from public.feedback f
join public.translation_jobs j on j.id = f.job_id
where f.comment is not null and f.comment <> ''
order by f.created_at desc;

-- 4-e. 사용자가 지목한 문제 줄 — 번호를 실제 대사로 바꾸려면 Storage의
--      결과물(`j.result_path`)을 열어 그 번호를 찾아야 한다. 대사는 DB에
--      절대 저장하지 않기 때문이다(0009 헤더). 여기서는 어느 파일의 몇 번인지만.
select
  j.source_filename,
  j.model,
  f.issue_kinds,
  f.reported_blocks,
  j.result_path
from public.feedback f
join public.translation_jobs j on j.id = f.job_id
where array_length(f.reported_blocks, 1) > 0
order by f.updated_at desc;


-- ══════════════════════════════════════ 5. 업로드 거절 — 문 앞에서 잃은 사람 ═══
-- `bilingualSmi`가 많으면 이중 언어 SMI 지원의 우선순위가 올라간다
-- (TODO에서 이미 P2로 올려둔 항목). `tooLarge`가 많으면 크레딧 상한이
-- 현실과 안 맞는다는 뜻이다.

select
  detail->>'reason'                                     as 거절사유,
  detail->>'format'                                     as 확장자,
  count(*)                                              as 건수,
  count(distinct user_id)                               as 사람수
from public.beta_events
where event = 'upload_rejected'
group by 1, 2
order by 3 desc;


-- ═══════════════════════════════════ 6. 결제 의향 — 소진까지 간 사람과 대기자 ═══
-- 크레딧을 다 쓴 사람 중 몇 명이 대기자 명단에 이름을 남겼는가.
-- 이게 결제 전환의 선행 지표다(0006 헤더).

select
  (select count(distinct user_id) from public.beta_events
    where event = 'credits_exhausted_shown')            as 소진화면_본_사람,
  (select count(*) from public.waitlist)                as 대기자_등록,
  (select count(*) from public.credits
    where lite_balance = 0 and pro_balance = 0)         as 잔액_0인_계정;

-- 6-b. 계정별 소비량 — 3편을 다 쓴 사람이 진짜 사용자다
select
  u.email,
  count(j.id)                                           as 번역_횟수,
  count(j.id) filter (where j.model like '%pro%')       as 프로_사용,
  c.lite_balance                                        as 남은_라이트,
  c.pro_balance                                         as 남은_프로,
  max(j.created_at)                                     as 마지막_번역,
  (w.user_id is not null)                               as 대기자_등록함
from auth.users u
left join public.credits c          on c.user_id = u.id
left join public.translation_jobs j on j.user_id = u.id
left join public.waitlist w         on w.user_id = u.id
group by u.email, c.lite_balance, c.pro_balance, w.user_id
order by 2 desc;


-- ═══════════════════════════════════════════ 7. 실측 원가 — θ와 청크 시간 ═══
-- `docs/tuning/cost-per-block.md`가 하네스 1표본(1,124블록 이탈리아 장편)에
-- 기대고 있다. 베타 사용자의 진짜 파일이 쌓이면 여기서 넓혀 재확인한다.
--
-- θ = 블록당 출력 토큰. 장편에서도 44 근처를 유지하는지가 핵심 질문이었다.

select
  model                                                 as 모델,
  thinking_level                                        as 사고수준,
  phase                                                 as 단계,
  count(*)                                              as 호출수,
  count(*) filter (where not ok)                        as 실패,
  round(avg(blocks), 0)                                 as 평균_블록,
  round(avg(output_tokens::numeric / nullif(blocks, 0)), 1) as 세타_블록당출력토큰,
  round(avg(thoughts_tokens), 0)                        as 평균_사고토큰,
  round(avg(latency_ms) / 1000.0, 1)                    as 평균_초,
  round(max(latency_ms) / 1000.0, 1)                    as 최장_초
from public.translation_chunk_usage
group by 1, 2, 3
order by 4 desc;

-- 7-b. 300초 타임아웃 여유 확인 — maxDuration=300에 실제로 얼마나 붙었나
select
  model                                                 as 모델,
  round(max(latency_ms) / 1000.0, 1)                    as 최장_단일청크_초,
  round(100.0 * max(latency_ms) / 300000.0, 1)          as 상한대비_퍼센트,
  count(*) filter (where latency_ms > 240000)           as 이백사십초_초과_호출
from public.translation_chunk_usage
where ok
group by 1;
