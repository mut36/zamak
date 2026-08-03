-- ZAMAK: 유저당 레이트 리밋 + 서버 예외 기록
--
-- Run this once in the Supabase SQL editor, after 0010_signup_credit_revert.sql.
-- (0010은 정식 오픈 시점에 실행하는 것이고 이 둘은 서로 독립이다 — 0010을 아직
--  안 돌렸어도 이 파일은 그냥 돌리면 된다.)
--
-- 두 가지가 한 마이그레이션에 있는 이유는 하나다: 둘 다 "베타 기간에 우리가
-- 눈을 뜨고 있기 위한" 배선이고, 어느 쪽도 제품 기능이 아니다.
--
--   1. api_rate_limits — 크레딧을 안 쓰는 AI 라우트의 유저당 호출 한도
--   2. server_errors   — 지금까지 Vercel 로그에만 남던 서버 예외
--
-- 0009와 같은 프라이버시 원칙을 그대로 따른다: **여기에 자막 텍스트가 들어가는
-- 경로는 없다.** server_errors.message는 예외 메시지이지 요청 본문이 아니고,
-- 앱 계층(app/lib/server/reportError.ts)이 길이를 잘라서 넣는다.

-- --------------------------------------------------- 1. 레이트 리밋 ---

-- 왜 DB인가: 배포가 Vercel 서버리스라 프로세스 메모리 카운터는 인스턴스마다
-- 따로 세고, 인스턴스가 늘어날수록 실효 한도가 같이 늘어난다(즉 가드가 아니다).
-- Supabase는 이미 모든 요청 경로에 있으므로 새 인프라가 0이다.
--
-- 유저·버킷당 한 행만 산다. 고정 창(fixed window)이라 창 경계에서 최대 2배까지
-- 몰릴 수 있지만, 이 가드가 막으려는 건 "스크립트로 수백 번"이지 정밀한
-- 셰이핑이 아니다(docs/TODO.md 베타 항목). 슬라이딩 윈도우는 행이 호출마다
-- 쌓여서 청소 cron이 따라붙는데, 그 복잡도를 살 이유가 없다.
create table if not exists public.api_rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- 라우트 묶음 이름. 값은 app/config/constants.ts의 RATE_LIMITS 키와 1:1.
  bucket       text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (user_id, bucket)
);

alter table public.api_rate_limits enable row level security;

-- 정책을 하나도 안 만든 건 실수가 아니다 — 이 표는 아래 security definer
-- 함수를 통해서만 읽고 쓴다. 클라이언트가 자기 카운터를 직접 만질 수 있으면
-- 그건 레이트 리밋이 아니다.

-- 한 번 호출 = 한 번 소모. 허용 여부와 "언제 다시 되는지"를 같이 돌려준다 —
-- 429에 Retry-After를 붙이려면 창 종료 시각이 필요한데, 그걸 클라이언트가
-- 계산하게 두면 서버 한도와 어긋난다.
create or replace function public.consume_rate_limit(
  p_bucket          text,
  p_limit           integer,
  p_window_seconds  integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hits    integer;
  v_start   timestamptz;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- 창이 지났으면 리셋, 아니면 증가. 두 SET 식 모두 **갱신 전** 행을 읽으므로
  -- 한 문장 안에서 판정과 증가가 같은 창을 본다(경쟁 조건 없음).
  insert into public.api_rate_limits as l (user_id, bucket, window_start, hits)
       values (v_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
     set window_start = case
           when l.window_start < now() - make_interval(secs => p_window_seconds)
           then now() else l.window_start end,
         hits = case
           when l.window_start < now() - make_interval(secs => p_window_seconds)
           then 1 else l.hits + 1 end
   returning l.hits, l.window_start into v_hits, v_start;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    -- 창이 닫힐 때까지 남은 초(올림, 최소 1). 허용된 호출에도 담기지만
    -- 라우트는 거절할 때만 읽는다.
    'retry_after', greatest(
      1,
      ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds)) - now()))
    )::integer
  );
end;
$$;

-- ------------------------------------------------- 2. 서버 예외 기록 ---

-- 여태 서버 예외는 console.error로 Vercel 로그에만 남았다. 베타 30명 규모에서
-- "유저가 말해 주지 않으면 실패를 모른다"가 실제 위험이고, beta_events(0009)는
-- 클라이언트 퍼널만 담아서 서버가 터진 건 안 보인다.
--
-- 외부 SaaS(Sentry 등) 대신 표 하나인 이유: 베타에 새 env·비용·개인정보
-- 처리위탁 항목을 늘리지 않고, 조회를 이미 쓰는 beta-review.sql 옆에 붙이기
-- 위해서다. 규모가 커지면 그때 갈아탈 것.
create table if not exists public.server_errors (
  id         bigserial primary key,
  -- not null인 건 RLS 때문이다(아래 insert 정책). 즉 **로그인 이전에 터진
  -- 예외는 여기 안 남는다** — 그 경로는 여전히 Vercel 로그가 유일한 기록이다.
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- '/api/translate' 같은 라우트 경로.
  route      text not null,
  -- 예외 클래스명이나 우리 에러 코드('AbortError', 'chunk_timeout' 등).
  kind       text not null,
  -- 예외 메시지. 앱 계층에서 길이를 자른다. 요청 본문은 절대 안 들어온다.
  message    text,
  -- 응답으로 나간 HTTP 상태(있으면).
  status     integer,
  -- 작고 평평한 코드만. 0009 beta_events.detail과 같은 규칙.
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists server_errors_created_idx
  on public.server_errors (created_at desc);
create index if not exists server_errors_route_idx
  on public.server_errors (route, created_at desc);

alter table public.server_errors enable row level security;

-- 쓰기만, 그리고 자기 이름으로만. 서버 라우트가 호출자의 세션으로 넣으므로
-- feedback·beta_events와 같은 모양이다.
drop policy if exists "server errors are insertable by their owner" on public.server_errors;
create policy "server errors are insertable by their owner"
  on public.server_errors for insert
  with check (auth.uid() = user_id);

-- select 정책은 일부러 없다. 이 표는 유저에게 보여줄 것이 아니라 우리가
-- 대시보드(service role)에서 읽는 것이다 — supabase/beta-review.sql 8번.
