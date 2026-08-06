-- ZAMAK: 무제한 테스터 allowlist
--
-- Run this once in the Supabase SQL editor, after 0012_event_grants.sql.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다 (docs/decisions.md 참고) —
-- 배포된 베타에 로그인해서 테스트할 때도 먹어야 의미가 있다.
--
-- 왜 필요한가: 운영자가 실사용 경로(업로드→번역→다운로드, 히스토리, 메트릭)를
-- 반복 테스트할 때마다 번역권이 소진된다. 잔액을 크게 충전해 두는 방법
-- (supabase/comp-credit.sql)도 있지만 그건 결국 다시 떨어지고, "충전한 잔액"과
-- "실제 매출"이 섞여 집계가 지저분해진다.
--
-- 왜 앱 코드가 아니라 DB인가: 차감은 begin_translation_job **한 곳**에서만
-- 일어난다. 라우트에 환경변수 우회 분기를 넣으면 결제 우회 코드가 프로덕션
-- 번들에 실려 나가지만, 여기서는 대상이 표에 명시적으로 적힌 행뿐이고
-- 회수도 delete 한 줄이다.
--
-- 등록/회수는 supabase/dev-seed.sql의 7번 블록 참고.

-- ------------------------------------------------ unlimited_testers 표 ---

create table if not exists public.unlimited_testers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.unlimited_testers enable row level security;

-- 읽기만 본인 행에 열어 둔다. /api/credits가 "이 계정이 무제한인가"를 알아야
-- 잔액 칩에 0편이라고 띄우지 않는다. 쓰기 정책은 만들지 않는다 — 등록은
-- 서비스 롤(SQL Editor 세션)만 할 수 있어야 하고, 클라이언트가 스스로를
-- 무제한으로 등록할 수 있으면 표 전체가 무의미해진다.
drop policy if exists "testers can see their own row" on public.unlimited_testers;
create policy "testers can see their own row"
  on public.unlimited_testers for select
  using (auth.uid() = user_id);

-- --------------------------------------- begin_translation_job: 차감 면제 ---

-- 0004판을 그대로 두고 allowlist 분기만 더한다. 시그니처가 같으므로 drop 없이
-- replace한다 — grant도 유지된다.
--
-- job row는 **면제 계정도 똑같이 insert한다.** 크레딧만 안 빠질 뿐 실사용과
-- 같은 경로를 타야 히스토리·record_job_result·메트릭까지 테스트가 된다.
-- (그래서 dev-seed 5번의 "파일 하나 = job 한 행" 검증도 그대로 쓸 수 있다.)
create or replace function public.begin_translation_job(
  p_total_blocks integer,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_job_id    uuid;
  v_kind      text;
  v_unlimited boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_total_blocks is null or p_total_blocks <= 0 then
    raise exception 'invalid block count' using errcode = '22023';
  end if;

  -- The caller passes a model id; the mapping to a balance lives here too so
  -- a client cannot pick which balance to drain.
  v_kind := case when p_model = 'gemini-3.1-pro-preview' then 'pro' else 'lite' end;

  select exists (
    select 1 from public.unlimited_testers where user_id = v_user_id
  ) into v_unlimited;

  if not v_unlimited then
    -- Single statement per branch: the row lock serialises concurrent requests,
    -- so the last credit cannot be spent twice.
    if v_kind = 'pro' then
      update public.credits
         set pro_balance = pro_balance - 1,
             updated_at = now()
       where user_id = v_user_id
         and pro_balance > 0;
    else
      update public.credits
         set lite_balance = lite_balance - 1,
             updated_at = now()
       where user_id = v_user_id
         and lite_balance > 0;
    end if;

    if not found then
      -- The kind is carried in the message so the route can tell the user which
      -- balance ran out without a second query.
      raise exception 'insufficient credits: %', v_kind using errcode = 'P0001';
    end if;
  end if;

  insert into public.translation_jobs (user_id, total_blocks, model)
  values (v_user_id, p_total_blocks, p_model)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.begin_translation_job(integer, text) from public;
grant execute on function public.begin_translation_job(integer, text) to authenticated;
