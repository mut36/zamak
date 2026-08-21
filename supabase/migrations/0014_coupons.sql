-- ZAMAK: 쿠폰 코드 = 기간제 무제한
--
-- Run this once in the Supabase SQL editor, after 0013_unlimited_testers.sql.
-- **개발용·배포용 두 프로젝트 모두**에 실행한다.
--
-- 왜 크레딧 N편 지급이 아닌가: 대상이 지인이라 남용 위험이 낮고, "몇 편
-- 남았나"를 신경 쓰게 하는 순간 선물의 성격이 사라진다. 손실 상한은 편수가
-- 아니라 기간으로 막는다.
--
-- 왜 새 권한 체계가 아닌가: 차감은 begin_translation_job **한 곳**에서만
-- 일어나고, 0013이 이미 그 한 곳이 참조하는 면제 allowlist를 갖고 있다.
-- 여기에 만료일을 더하면 그대로 기간제가 된다. coupons는 그 allowlist에
-- 자기를 등록하는 입구일 뿐이다.

-- ------------------------------------- unlimited_testers: 만료일 ---

-- null = 무기한. 0013이 넣어 둔 운영자 행은 손대지 않아도 그대로 무기한이다.
alter table public.unlimited_testers
  add column if not exists expires_at timestamptz;

-- ------------------------------------------------------- coupons ---

create table if not exists public.coupons (
  code            text primary key,
  duration_days   integer not null check (duration_days > 0),
  max_redemptions integer check (max_redemptions > 0),
  redeemed_count  integer not null default 0,
  valid_until     timestamptz,
  active          boolean not null default true,
  note            text,
  created_at      timestamptz not null default now()
);

-- api_rate_limits(0011)·event_grants(0012)와 같은 이유로 RLS는 켜되 정책을
-- 하나도 만들지 않는다 — 이 표는 security definer 함수와 서비스 롤로만 읽고
-- 쓴다. 클라이언트가 coupons를 select할 수 있으면 비밀코드가 비밀이 아니다.
alter table public.coupons enable row level security;

-- --------------------------------------------- coupon_redemptions ---

-- 중복 사용 차단이 곧 기본키 제약이다(event_grants와 같은 패턴).
-- event_grants에 얹지 않는 이유: event_code 네임스페이스에 쿠폰이 섞이면
-- 이벤트 지급 이력 집계가 지저분해진다.
create table if not exists public.coupon_redemptions (
  code        text not null references public.coupons (code) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);

alter table public.coupon_redemptions enable row level security;

-- ---------------------------------------------------- 코드 정규화 ---

-- 한글에 upper()는 무해하다. 영문 코드를 섞어 발행할 때를 위해 남긴다.
-- 실제 목적은 모바일 IME가 붙이는 앞뒤·중간 공백을 흡수하는 것이다.
-- 클라이언트도 같은 규칙을 쓰지만(app/lib/coupon.ts) 신뢰하는 쪽은 여기다.
create or replace function public.normalize_coupon_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(normalize(coalesce(p_code, ''), nfc), '\s', '', 'g'));
$$;

-- ------------------------------------------------------- 코드 교환 ---

create or replace function public.redeem_coupon(p_code text)
returns table (status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_code     text := public.normalize_coupon_code(p_code);
  v_coupon   public.coupons%rowtype;
  v_inserted integer;
  v_expires  timestamptz;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- for update: 동시 요청을 이 행에서 직렬화한다. 잠금 없이는 두 사람이
  -- 동시에 마지막 한 자리를 가져가 max_redemptions를 넘길 수 있다.
  select * into v_coupon from public.coupons
   where code = v_code
     for update;

  -- 없는 코드 / 회수된 코드 / 수명이 끝난 코드를 같은 사유로 답한다. 존재
  -- 여부를 구분해 알려주면 그게 곧 열거 힌트다. 정원 검사는 여기 넣지 않고
  -- 아래로 미룬다 — 순서 이유는 바로 다음 블록 주석 참고.
  if v_coupon.code is null
     or not v_coupon.active
     or (v_coupon.valid_until is not null and v_coupon.valid_until < now())
  then
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;

  -- 정원 검사보다 먼저 본다: 이미 쓴 사람에게 "정원이 찼다"는 뜻의 invalid를
  -- 돌려주면 자기가 언제 썼는지도 모르게 된다. 다른 사람들이 그 뒤에 정원을
  -- 채웠더라도 이미 쓴 사람은 항상 already_redeemed로 답을 받아야 한다.
  if exists (
    select 1 from public.coupon_redemptions r
     where r.code = v_code and r.user_id = v_user_id
  ) then
    select t.expires_at into v_expires
      from public.unlimited_testers t where t.user_id = v_user_id;
    return query select 'already_redeemed'::text, v_expires;
    return;
  end if;

  if v_coupon.max_redemptions is not null
     and v_coupon.redeemed_count >= v_coupon.max_redemptions
  then
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;

  insert into public.coupon_redemptions (code, user_id)
  values (v_code, v_user_id)
  on conflict (code, user_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- 벨트-앤-브레이스: 위 exists 검사와 이 insert 사이에 같은 유저가 다른
    -- 탭에서 동시에 교환을 시도하는 극히 드문 경쟁 상황만 여기로 온다.
    -- 사용자가 "왜 안 되지" 하고 재시도하는 걸 막는 실용적인 이유이고,
    -- 이미 자기가 쓴 코드라 새로 새는 정보도 없다.
    select t.expires_at into v_expires
      from public.unlimited_testers t where t.user_id = v_user_id;
    return query select 'already_redeemed'::text, v_expires;
    return;
  end if;

  -- 연장 누적: 아직 유효한 사람이 다른 코드를 넣어도 남은 기간이 깎이지
  -- 않는다. 반대로 이미 만료된 사람은 now()에서 다시 센다.
  select t.expires_at into v_expires
    from public.unlimited_testers t where t.user_id = v_user_id;

  if found and v_expires is null then
    -- 무기한 계정(운영자)에는 만료일을 새로 박지 않는다. 쿠폰이 상위 권한을
    -- 되레 깎아내리는 사고를 막는다.
    update public.coupons set redeemed_count = redeemed_count + 1
     where code = v_code;
    return query select 'ok'::text, null::timestamptz;
    return;
  end if;

  v_expires := greatest(coalesce(v_expires, now()), now())
               + make_interval(days => v_coupon.duration_days);

  insert into public.unlimited_testers (user_id, note, expires_at)
  values (v_user_id, '쿠폰: ' || v_code, v_expires)
      on conflict (user_id)
      do update set expires_at = excluded.expires_at;

  update public.coupons set redeemed_count = redeemed_count + 1
   where code = v_code;

  return query select 'ok'::text, v_expires;
end;
$$;

revoke all on function public.redeem_coupon(text) from public;
grant execute on function public.redeem_coupon(text) to authenticated;

-- ------------------------------- begin_translation_job: 만료 반영 ---

-- 0013판을 그대로 두고 allowlist 조건에 만료만 더한다. 시그니처가 같으므로
-- drop 없이 replace한다 — grant도 유지된다.
--
-- ⚠️ 이 교체가 빠지면 쿠폰은 기간제가 아니라 영구 무제한이 된다.
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
    select 1 from public.unlimited_testers
     where user_id = v_user_id
       and (expires_at is null or expires_at > now())
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

-- ------------------------------------------------ 첫 쿠폰 발행 ---

insert into public.coupons (code, duration_days, max_redemptions, note)
values (public.normalize_coupon_code('세르지오'), 30, 10, '지인 배포 2026-08')
    on conflict (code) do nothing;
