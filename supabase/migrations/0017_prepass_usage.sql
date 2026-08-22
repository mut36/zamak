-- ZAMAK: 연출 메모·규칙 적용 호출도 토큰 사용량 표에 넣는다
--
-- Run this once in the Supabase SQL editor, after 0016_coupon_expiry.sql.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다.
--
-- 왜: `translation_chunk_usage`(0009)는 "번역 청크" 호출만 셌다. 연출 메모
-- (`/api/note`)는 파일당 1회, 자막 전체를 한 번 읽는 **과금되지 않는 가장 비싼
-- 호출**인데 여태 Vercel 로그에만 남았다. 그래서 이 표를 합산한 금액은 실제
-- 청구서보다 항상 적었고, 사용량 집계(supabase/api-usage.sql)가
-- 조용히 틀린 답을 냈다.
--
-- 같은 구멍이 규칙 적용(`/api/polish`)에도 있었다. 이쪽은 청크가 여러 개고
-- 청크마다 한 행이 남는다.
--
-- 바뀌는 것은 둘뿐이다: 두 프리패스에는 job이 없으므로 job_id가 nullable이
-- 되고, phase에 'note'·'polish'가 추가된다. 컬럼은 하나도 늘지 않는다 —
-- 둘 다 "모델 호출 1건"이고, 토큰·지연·성패는 청크와 똑같이 생겼다.

alter table public.translation_chunk_usage
  alter column job_id drop not null;

comment on column public.translation_chunk_usage.job_id is
  'null이면 job에 매이지 않은 호출 — 연출 메모·규칙 적용처럼 번역 job 밖에서 '
  '도는 프리패스다. 크레딧을 안 쓰므로 붙일 job이 존재하지 않는다.';

alter table public.translation_chunk_usage
  drop constraint if exists translation_chunk_usage_phase_check;
alter table public.translation_chunk_usage
  add constraint translation_chunk_usage_phase_check
  check (phase in ('main', 'sweep', 'note', 'polish'));

-- 삽입 정책: job_id가 있으면 여전히 "내 job"이어야 하고, 없으면 본인 행이라는
-- 것만 본다. job_id를 null로 보내면 소유 검사를 건너뛰는 셈이지만, 그 행이
-- 주장할 수 있는 것은 "이 사용자가 모델을 한 번 불렀다"뿐이고 user_id는 여전히
-- auth.uid()로 고정된다.
drop policy if exists "chunk usage is insertable by its owner" on public.translation_chunk_usage;
create policy "chunk usage is insertable by its owner"
  on public.translation_chunk_usage for insert
  with check (
    auth.uid() = user_id
    and (
      job_id is null
      or exists (
        select 1 from public.translation_jobs j
         where j.id = job_id and j.user_id = auth.uid()
      )
    )
  );
