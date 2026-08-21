# 쿠폰 코드 = 기간제 무제한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지인이 비밀코드를 입력하면 30일간 번역권 차감 없이 쓸 수 있게 한다.

**Architecture:** 새 권한 체계를 만들지 않는다. 0013의 `unlimited_testers`(차감 면제 allowlist)에 `expires_at` 컬럼을 더해 기간제로 만들고, `coupons` 표와 `redeem_coupon` RPC는 그 allowlist에 **본인을 등록하는 입구** 역할만 한다. 차감은 여전히 `begin_translation_job` 한 곳에서만 일어나므로, 만료 판정도 그 함수와 `/api/credits` 두 군데에만 들어간다.

**Tech Stack:** Next.js App Router (route handlers), Supabase Postgres (security definer RPC + RLS), TypeScript, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-21-coupon-unlimited-design.md`

## Global Constraints

- 화면 문구는 하드코딩 금지 → `app/i18n/simpleCopy.ts`의 `COPY`.
- 설정·상수는 `app/config/constants.ts` 한 곳.
- 마이그레이션은 **개발용·배포용 두 Supabase 프로젝트 모두**에 실행한다.
- 첫 코드는 `세르지오`, 기간 30일, 코드당 최대 10명.
- 실패 사유는 `invalid` 하나로 뭉뚱그린다. 단 `already_redeemed`만 구분한다.
- 검증 명령: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`
- 기능 단위로 커밋한다 (태스크당 1커밋).
- CLAUDE.md의 불변식 4개와 번역 파이프라인 문서는 이 작업의 영향 범위 밖이다.

---

### Task 1: 마이그레이션 `0014_coupons.sql`

DB만 바꾼다. 앱 코드는 아직 이 표를 모른다.

**Files:**
- Create: `supabase/migrations/0014_coupons.sql`

**Interfaces:**
- Consumes: 0013의 `public.unlimited_testers`, `public.begin_translation_job(integer, text)`
- Produces:
  - 표 `public.coupons(code, duration_days, max_redemptions, redeemed_count, valid_until, active, note, created_at)`
  - 표 `public.coupon_redemptions(code, user_id, redeemed_at)`
  - 컬럼 `public.unlimited_testers.expires_at timestamptz`
  - 함수 `public.normalize_coupon_code(text) returns text`
  - 함수 `public.redeem_coupon(p_code text) returns table (status text, expires_at timestamptz)` — status ∈ `'ok' | 'already_redeemed' | 'invalid'`
  - 교체된 `public.begin_translation_job(integer, text)` (만료 반영)

- [ ] **Step 1: 마이그레이션 파일을 쓴다**

`supabase/migrations/0014_coupons.sql`:

```sql
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

  -- 없는 코드 / 회수된 코드 / 수명이 끝난 코드 / 정원이 찬 코드를 전부 같은
  -- 사유로 답한다. 존재 여부를 구분해 알려주면 그게 곧 열거 힌트다.
  if v_coupon.code is null
     or not v_coupon.active
     or (v_coupon.valid_until is not null and v_coupon.valid_until < now())
     or (v_coupon.max_redemptions is not null
         and v_coupon.redeemed_count >= v_coupon.max_redemptions)
  then
    return query select 'invalid'::text, null::timestamptz;
    return;
  end if;

  insert into public.coupon_redemptions (code, user_id)
  values (v_code, v_user_id)
  on conflict (code, user_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- 이것만 따로 구분한다. 사용자가 "왜 안 되지" 하고 재시도하는 걸 막는
    -- 실용적인 이유이고, 이미 자기가 쓴 코드라 새로 새는 정보도 없다.
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

  v_kind := case when p_model = 'gemini-3.1-pro-preview' then 'pro' else 'lite' end;

  select exists (
    select 1 from public.unlimited_testers
     where user_id = v_user_id
       and (expires_at is null or expires_at > now())
  ) into v_unlimited;

  if not v_unlimited then
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
```

- [ ] **Step 2: 개발용 Supabase 프로젝트의 SQL Editor에서 실행한다**

에러 없이 끝나야 한다. `create or replace function`이 시그니처 충돌로 실패하면 0013이 안 깔린 DB다 — 먼저 0013을 실행할 것.

- [ ] **Step 3: 정규화와 발행을 확인한다**

SQL Editor에서:

```sql
select public.normalize_coupon_code('  세 르지오 ');
-- 기대: 세르지오

select code, duration_days, max_redemptions, redeemed_count, active
  from public.coupons;
-- 기대: 세르지오 | 30 | 10 | 0 | true
```

- [ ] **Step 4: 교환을 손으로 한 번 돌려 본다**

앱에 로그인한 브라우저 세션이 아니라 SQL Editor는 `auth.uid()`가 null이라 `28000`이 난다. 이는 **정상 동작**이며, 실제 교환 검증은 Task 6의 dev-seed 블록과 Task 5 UI로 한다. 여기서는 함수가 존재하는지만 본다:

```sql
select proname from pg_proc where proname in ('redeem_coupon', 'normalize_coupon_code');
-- 기대: 두 행
```

- [ ] **Step 5: 배포용 Supabase 프로젝트에도 같은 파일을 실행한다**

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0014_coupons.sql
git commit -m "쿠폰 코드로 기간제 무제한을 여는 표와 함수를 만든다"
```

---

### Task 2: 코드 정규화·상태 타입 (`app/lib/coupon.ts`)

앱 쪽의 순수 모듈. 라우트와 UI가 공유하고, 테스트가 붙는 유일한 로직이다.

**Files:**
- Create: `app/lib/coupon.ts`
- Create: `app/lib/coupon.test.ts`
- Modify: `app/config/constants.ts` (`RATE_LIMITS`에 `coupon` 버킷 추가, `COUPON_CODE_MAX_LENGTH` 추가)

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `normalizeCouponCode(raw: string): string`
  - `type CouponRedeemStatus = 'ok' | 'already_redeemed' | 'invalid'`
  - `isCouponRedeemStatus(value: unknown): value is CouponRedeemStatus`
  - `COUPON_CODE_MAX_LENGTH: number` (constants.ts)
  - `RATE_LIMITS.coupon` (constants.ts)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/lib/coupon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeCouponCode,
  isCouponRedeemStatus,
} from './coupon';

describe('normalizeCouponCode', () => {
  it('앞뒤 공백을 지운다', () => {
    expect(normalizeCouponCode('  세르지오 ')).toBe('세르지오');
  });

  it('가운데 공백도 지운다 — 모바일 IME가 흘리는 공백을 흡수한다', () => {
    expect(normalizeCouponCode('세 르지오')).toBe('세르지오');
  });

  it('탭과 개행도 공백으로 본다', () => {
    expect(normalizeCouponCode('세르\t지오\n')).toBe('세르지오');
  });

  it('영문은 대문자로 올린다', () => {
    expect(normalizeCouponCode('zamak2026')).toBe('ZAMAK2026');
  });

  it('한글은 대문자 규칙에 영향받지 않는다', () => {
    expect(normalizeCouponCode('세르지오')).toBe('세르지오');
  });

  it('NFD로 들어온 한글을 NFC로 합친다 — macOS 붙여넣기 경로', () => {
    const nfd = '세르지오'.normalize('NFD');
    expect(nfd).not.toBe('세르지오');
    expect(normalizeCouponCode(nfd)).toBe('세르지오');
  });

  it('빈 문자열은 빈 문자열이다', () => {
    expect(normalizeCouponCode('   ')).toBe('');
  });
});

describe('isCouponRedeemStatus', () => {
  it('세 가지 상태만 통과시킨다', () => {
    expect(isCouponRedeemStatus('ok')).toBe(true);
    expect(isCouponRedeemStatus('already_redeemed')).toBe(true);
    expect(isCouponRedeemStatus('invalid')).toBe(true);
  });

  it('모르는 값은 거른다 — DB가 새 상태를 뱉어도 화면이 깨지지 않는다', () => {
    expect(isCouponRedeemStatus('expired')).toBe(false);
    expect(isCouponRedeemStatus(null)).toBe(false);
    expect(isCouponRedeemStatus(3)).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run app/lib/coupon.test.ts`
Expected: FAIL — `Failed to resolve import "./coupon"`

- [ ] **Step 3: 모듈을 쓴다**

`app/lib/coupon.ts`:

```ts
/**
 * 쿠폰 코드 정규화 — `normalize_coupon_code`(0014)와 **같은 규칙**이다.
 *
 * 두 곳에 같은 규칙을 두는 이유: 화면은 사용자가 입력하는 즉시 정규화된 코드를
 * 보여줘야 하고(공백을 흘린 채 "코드가 틀렸다"고 말하면 사용자가 이유를
 * 모른다), 서버는 클라이언트가 정규화를 했다고 믿을 수 없다. 신뢰하는 쪽은
 * 언제나 DB다.
 *
 * 한글에 대문자 규칙은 무해하고, 영문 코드를 섞어 발행할 때를 위해 남긴다.
 * 실제 목적은 모바일 IME와 붙여넣기가 흘리는 공백·NFD 자모의 흡수다.
 */
export function normalizeCouponCode(raw: string): string {
  return raw.normalize('NFC').replace(/\s/g, '').toUpperCase();
}

/**
 * `redeem_coupon`이 돌려주는 세 가지 결말.
 *
 * `invalid`는 "없는 코드 / 회수된 코드 / 수명이 끝난 코드 / 정원이 찬 코드"를
 * 전부 뭉뚱그린 값이다 — 존재 여부를 구분해 알려주면 그게 곧 열거 힌트다.
 */
export type CouponRedeemStatus = 'ok' | 'already_redeemed' | 'invalid';

const STATUSES: readonly string[] = ['ok', 'already_redeemed', 'invalid'];

/** DB가 모르는 상태를 뱉어도 화면이 깨지지 않도록 경계에서 좁힌다. */
export function isCouponRedeemStatus(
  value: unknown,
): value is CouponRedeemStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run app/lib/coupon.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: 상수를 더한다**

`app/config/constants.ts` — `RATE_LIMITS`(316행 근처) 안, `polish` 항목 **뒤**에 추가한다:

```ts
  /**
   * /api/coupons/redeem — 비밀코드 교환. 지인 배포용이라 코드가 짧고 사람이
   * 기억할 수 있는 말이므로, 무차별 대입이 실제로 가능한 유일한 입구다.
   * 정상 사용자는 평생 한두 번 부르는 경로라 한도를 아주 낮게 잡는다.
   */
  coupon: { limit: 5, windowSeconds: 3_600 },
```

같은 파일의 `UNLIMITED_CREDIT_DISPLAY`(278행) 바로 아래에 추가한다:

```ts
/**
 * 쿠폰 코드 입력 상한. 코드는 사람이 외워서 치는 짧은 말이고, 이 길이를
 * 넘는 입력은 코드가 아니라 쓰레기다 — 정규화 전에 잘라 버린다.
 */
export const COUPON_CODE_MAX_LENGTH = 64;
```

- [ ] **Step 6: 검증하고 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/lib/coupon.ts app/lib/coupon.test.ts app/config/constants.ts
git commit -m "쿠폰 코드 정규화 규칙을 DB와 같은 모양으로 앱에도 둔다"
```

---

### Task 3: 라우트 `POST /api/coupons/redeem`

**Files:**
- Create: `app/api/coupons/redeem/route.ts`

**Interfaces:**
- Consumes: `requireUser()` (`app/lib/server/auth.ts`), `enforceRateLimit('coupon')` (`app/lib/server/rateLimit.ts`), `normalizeCouponCode` / `isCouponRedeemStatus` (`app/lib/coupon.ts`), `COUPON_CODE_MAX_LENGTH` (`app/config/constants.ts`), RPC `redeem_coupon`
- Produces: `POST /api/coupons/redeem` — 요청 `{ code: string }`, 응답 `{ status: CouponRedeemStatus; expiresAt: string | null }` (200) / `{ error: string }` (400·401·429·500)

- [ ] **Step 1: 라우트를 쓴다**

`app/api/coupons/redeem/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { enforceRateLimit } from '../../../lib/server/rateLimit';
import {
  normalizeCouponCode,
  isCouponRedeemStatus,
} from '../../../lib/coupon';
import { COUPON_CODE_MAX_LENGTH } from '../../../config/constants';

interface RedeemRow {
  status: string;
  expires_at: string | null;
}

/**
 * 비밀코드를 기간제 무제한으로 바꾼다.
 *
 * 라우트는 얇다 — 유효성·정원·중복 판정은 전부 `redeem_coupon`(0014) 안에
 * 있다. 그래야 판정과 지급이 한 트랜잭션이고, coupons 표를 클라이언트에
 * 한 번도 노출하지 않는다.
 *
 * 이 경로는 `enforceRateLimit`이 **fail-open**인 몇 안 되는 예외를 감수한다:
 * 대입 시도를 막는 게 목적이지만, 진짜 천장은 여기가 아니라 `max_redemptions`
 * (정원 10명)다. 한도가 잠깐 열려도 쿠폰이 무한히 풀리지는 않는다.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limit = await enforceRateLimit('coupon');
  if (!limit.ok) return limit.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = typeof body.code === 'string' ? body.code : '';
  const code = normalizeCouponCode(raw.slice(0, COUPON_CODE_MAX_LENGTH));
  if (!code) {
    return NextResponse.json({ error: 'missing code' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_coupon', {
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // returns table (...) 이므로 행 배열로 온다.
  const row = Array.isArray(data) ? (data[0] as RedeemRow | undefined) : undefined;
  const status = isCouponRedeemStatus(row?.status) ? row.status : 'invalid';

  return NextResponse.json({
    status,
    expiresAt: status === 'invalid' ? null : (row?.expires_at ?? null),
  });
}
```

- [ ] **Step 2: 타입·린트를 통과시킨다**

Run: `npx tsc --noEmit && npx eslint app`
Expected: 에러 없음. `isCouponRedeemStatus(row?.status)` 이후 `row.status`가 좁혀지지 않는다는 에러가 나면 `row`가 `undefined`일 수 있어서다 — 그 경우 `const status = row && isCouponRedeemStatus(row.status) ? row.status : 'invalid';`로 고친다.

- [ ] **Step 3: 커밋**

```bash
git add app/api/coupons/redeem/route.ts
git commit -m "쿠폰 교환 라우트를 연다"
```

---

### Task 4: 만료를 화면까지 나르기 (`/api/credits` → `useAuth` → 잔액 칩)

**Files:**
- Modify: `app/api/credits/route.ts` (무제한 판정에 만료 조건 + `expiresAt` 반환)
- Modify: `app/lib/creditKind.ts` (`CreditBalances`에 `unlimitedUntil` 추가)
- Modify: `app/hooks/useAuth.ts` (응답 전달)
- Modify: `app/components/beta/AppNav.tsx` (칩 문구)
- Modify: `app/i18n/simpleCopy.ts` (`COPY.nav`)

**Interfaces:**
- Consumes: Task 1의 `unlimited_testers.expires_at`
- Produces:
  - `CreditBalances = { lite: number; pro: number; unlimitedUntil?: string | null }`
  - `/api/credits` 응답에 `credits.unlimitedUntil` (ISO 문자열 또는 null)
  - `COPY.nav.unlimited(until: string | null): string`

- [ ] **Step 1: `CreditBalances`를 넓힌다**

`app/lib/creditKind.ts`의 인터페이스를 교체한다:

```ts
export interface CreditBalances {
  lite: number;
  pro: number;
  /**
   * 무제한 계정의 만료 시각(ISO). `null`이면 무기한(운영자), 필드 자체가
   * 없으면 무제한이 아닌 보통 계정이다.
   */
  unlimitedUntil?: string | null;
}
```

- [ ] **Step 2: `/api/credits`가 만료를 보고 판정하게 한다**

`app/api/credits/route.ts`의 tester 조회와 그 아래 분기를 교체한다:

```ts
  // 무제한 테스터(0013)는 차감이 DB에서 면제되므로 실제 잔액이 0에 머문다.
  // 그대로 내보내면 번역은 되는데 화면만 "0편 남음"이 되므로 표시용 값으로
  // 바꿔 준다. 조회가 실패해도(표가 아직 없는 DB 등) 잔액 화면이 깨지면 안
  // 되니 에러는 삼키고 일반 계정으로 취급한다.
  //
  // 만료 조건은 begin_translation_job(0014)과 **같아야 한다** — 다르면 화면은
  // 무제한이라 하는데 번역은 거절당하는 상태가 생긴다.
  const { data: tester } = await supabase
    .from('unlimited_testers')
    .select('expires_at')
    .eq('user_id', auth.user.id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (tester) {
    return NextResponse.json({
      credits: {
        lite: UNLIMITED_CREDIT_DISPLAY,
        pro: UNLIMITED_CREDIT_DISPLAY,
        unlimitedUntil: tester.expires_at ?? null,
      },
      email: auth.user.email ?? null,
    });
  }
```

- [ ] **Step 3: `useAuth`가 필드를 흘리지 않게 한다**

`app/hooks/useAuth.ts`의 `refreshBalance` 안 fallback을 교체한다:

```ts
        credits: data.credits ?? { lite: 0, pro: 0 },
```

이 줄은 그대로 두어도 된다 — `unlimitedUntil`은 선택 필드이고 `data.credits`를 통째로 넘기므로 자동으로 실린다. **변경 없음을 확인만 하고 넘어간다.**

- [ ] **Step 4: 칩 문구를 더한다**

`app/i18n/simpleCopy.ts`의 `nav`(17행)를 교체한다:

```ts
  nav: {
    credits: (lite: number, pro: number) => `라이트 ${lite} · 프로 ${pro}`,
    // 무제한 계정은 편수가 의미 없다. 만료가 있으면 날짜까지, 없으면(운영자)
    // 그냥 무제한.
    unlimited: (until: string | null) =>
      until
        ? `무제한 · ${new Date(until).toLocaleDateString('ko-KR', {
            month: 'numeric',
            day: 'numeric',
          })}까지`
        : '무제한',
    mypage: '마이페이지',
  },
```

- [ ] **Step 5: 칩이 그 문구를 쓰게 한다**

`app/components/beta/AppNav.tsx`에서 `COPY.nav.credits(credits.lite, credits.pro)`를 쓰는 줄을 교체한다:

```tsx
              {credits.unlimitedUntil !== undefined
                ? COPY.nav.unlimited(credits.unlimitedUntil)
                : COPY.nav.credits(credits.lite, credits.pro)}
```

- [ ] **Step 6: 검증**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run`
Expected: 전부 통과.

- [ ] **Step 7: 커밋**

```bash
git add app/api/credits/route.ts app/lib/creditKind.ts app/components/beta/AppNav.tsx app/i18n/simpleCopy.ts
git commit -m "무제한 만료일을 잔액 칩까지 나른다"
```

---

### Task 5: 마이페이지 쿠폰 입력 UI

**Files:**
- Create: `app/components/CouponRedeemCard.tsx`
- Modify: `app/mypage/page.tsx` (카드 배치, 교환 성공 시 잔액 갱신)
- Modify: `app/hooks/useAuth.ts` (`refreshBalance`를 반환값에 노출)
- Modify: `app/i18n/simpleCopy.ts` (`COPY.coupon`)

**Interfaces:**
- Consumes: `POST /api/coupons/redeem` (Task 3), `normalizeCouponCode` (Task 2), `useAuth().refreshBalance`
- Produces: `<CouponRedeemCard onRedeemed={() => void} />`

- [ ] **Step 1: 문구를 더한다**

`app/i18n/simpleCopy.ts`의 `mypage` 블록 **뒤**에 추가한다:

```ts
  coupon: {
    title: '쿠폰 코드',
    placeholder: '받으신 코드를 입력하세요',
    submit: '등록',
    submitting: '확인 중…',
    ok: (until: string | null) =>
      until
        ? `등록됐습니다. ${new Date(until).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}까지 번역권 차감 없이 쓰실 수 있어요.`
        : '등록됐습니다.',
    alreadyRedeemed: '이미 사용하신 코드예요.',
    invalid: '사용할 수 없는 코드예요. 다시 확인해 주세요.',
    failed: '잠시 후 다시 시도해 주세요.',
  },
```

- [ ] **Step 2: 카드 컴포넌트를 쓴다**

`app/components/CouponRedeemCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { normalizeCouponCode, isCouponRedeemStatus } from '../lib/coupon';
import { COUPON_CODE_MAX_LENGTH } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';

const c = COPY.coupon;

interface CouponRedeemCardProps {
  /** 교환이 성공했을 때 잔액을 다시 읽게 한다. */
  onRedeemed: () => void;
}

/**
 * 비밀코드 입력 한 칸.
 *
 * 판정은 전부 서버에 있다 — 여기서 하는 일은 입력을 정규화해 보내고, 돌아온
 * 세 가지 결말을 사람 말로 바꾸는 것뿐이다. 실패 사유를 더 캐묻지 않는 것도
 * 의도다(코드 존재 여부를 알려주면 그게 열거 힌트가 된다).
 */
export function CouponRedeemCard({ onRedeemed }: CouponRedeemCardProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const normalized = normalizeCouponCode(code);

  async function submit() {
    if (!normalized || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      if (!res.ok) {
        setMessage(c.failed);
        return;
      }
      const data = (await res.json()) as {
        status?: unknown;
        expiresAt?: string | null;
      };
      const status = isCouponRedeemStatus(data.status) ? data.status : 'invalid';
      if (status === 'ok') {
        setMessage(c.ok(data.expiresAt ?? null));
        setCode('');
        onRedeemed();
      } else if (status === 'already_redeemed') {
        setMessage(c.alreadyRedeemed);
      } else {
        setMessage(c.invalid);
      }
    } catch {
      setMessage(c.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='card p-[22px_24px]'>
      <div className='text-caption text-tertiary'>{c.title}</div>
      <div className='mt-2 flex gap-2'>
        <input
          type='text'
          value={code}
          maxLength={COUPON_CODE_MAX_LENGTH}
          placeholder={c.placeholder}
          className='input flex-1'
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
        />
        <button
          type='button'
          className='btn btn-ghost shrink-0'
          disabled={!normalized || busy}
          onClick={() => void submit()}
        >
          {busy ? c.submitting : c.submit}
        </button>
      </div>
      {message && (
        <p className='text-caption-sm text-secondary mt-2.5'>{message}</p>
      )}
    </div>
  );
}
```

`className='input'`이 이 프로젝트에 없으면 `app/components/beta/ExhaustedStep.tsx`의 이메일 입력이 쓰는 클래스를 그대로 가져다 쓴다 — 새 스타일을 만들지 말 것.

- [ ] **Step 3: `useAuth`가 `refreshBalance`를 내보내게 한다**

`app/hooks/useAuth.ts`의 반환 객체에 `refreshBalance`를 더한다. 훅 끝의 `return { ... }`에 한 줄 추가하면 된다(`signIn`, `signOut`과 같은 자리).

- [ ] **Step 4: 마이페이지에 배치한다**

`app/mypage/page.tsx`:

1. import 추가: `import { CouponRedeemCard } from '../components/CouponRedeemCard';`
2. `const { user, credits, loading, signOut } = useAuth();` → `const { user, credits, loading, signOut, refreshBalance } = useAuth();`
3. `{c.retention(RESULT_RETENTION_DAYS)}` 문단 **바로 뒤**, `<p className='qlabel'>{c.historyTitle}</p>` **앞**에 넣는다:

```tsx
            <div className='mb-7'>
              <CouponRedeemCard onRedeemed={refreshBalance} />
            </div>
```

이때 바로 위 `retention` 문단의 `mb-7`은 `mb-3`으로 줄인다 — 카드가 그 아래 간격을 대신 갖는다.

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run`
Expected: 전부 통과.

- [ ] **Step 6: 브라우저로 확인한다**

Browser 도구로 `npm run dev`(launch.json)를 띄우고 `/mypage`에서:
- 아무 문자열 → "사용할 수 없는 코드예요."
- `세 르지오` (공백 포함) → 등록 성공, 만료일 문구, 잔액 칩이 `무제한 · …까지`로 바뀜
- 같은 코드 재입력 → "이미 사용하신 코드예요."

Bash로 서버를 띄우지 말 것.

- [ ] **Step 7: 커밋**

```bash
git add app/components/CouponRedeemCard.tsx app/mypage/page.tsx app/hooks/useAuth.ts app/i18n/simpleCopy.ts
git commit -m "마이페이지에서 쿠폰 코드를 등록할 수 있게 한다"
```

---

### Task 6: 발행·회수 스니펫과 문서

**Files:**
- Modify: `supabase/dev-seed.sql` (8번 블록 추가)
- Modify: `docs/decisions.md` (결정 기록 추가)
- Modify: `package.json` (버전 1.4.7 → 1.5.0)

**Interfaces:**
- Consumes: Task 1의 표와 함수
- Produces: 없음 (문서)

- [ ] **Step 1: dev-seed에 8번 블록을 더한다**

`supabase/dev-seed.sql` 맨 뒤에 추가한다:

```sql
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
```

- [ ] **Step 2: `docs/decisions.md`에 결정을 남긴다**

파일 맨 뒤에 추가한다:

```markdown
## 쿠폰은 크레딧을 주지 않고 기간을 준다

지인에게 뿌리는 비밀코드가 지급하는 것은 번역권 N편이 아니라 **30일간의 차감
면제**다. 대상이 지인이라 남용 위험이 낮고, "몇 편 남았나"를 신경 쓰게 하는
순간 선물의 성격이 사라진다. 손실 상한은 편수가 아니라 기간과 정원(코드당
10명)으로 막는다.

새 권한 체계를 만들지 않은 것도 같은 판단이다. 차감은 `begin_translation_job`
**한 곳**에서만 일어나고, 0013의 `unlimited_testers`가 이미 그 한 곳이
참조하는 면제 allowlist다. 여기에 `expires_at` 하나를 더하니 기간제가 됐고,
`coupons`는 그 allowlist에 자기를 등록하는 입구로 남았다. 그래서 만료 판정이
들어간 곳은 `begin_translation_job`과 `/api/credits` 둘뿐이다 — **두 곳의
조건은 반드시 같아야 한다.** 다르면 화면은 무제한이라 하는데 번역은 거절되는
상태가 생긴다.

**실패 사유를 뭉뚱그린다.** 없는 코드·회수된 코드·수명이 끝난 코드·정원이 찬
코드가 전부 같은 `invalid`로 돌아온다. 구분해 알려주면 그게 곧 코드 열거
힌트다. `already_redeemed`만 따로 두는데, 이미 자기가 쓴 코드라 새로 새는
정보가 없고 사용자가 영문도 모른 채 재시도하는 걸 막아 준다.

**연장은 누적이고, 무기한은 건드리지 않는다.** 아직 유효한 사람이 다른 코드를
넣으면 남은 기간에 더해진다. 반대로 `expires_at`이 null인 운영자 계정에는
쿠폰이 만료일을 새로 박지 않는다 — 쿠폰이 상위 권한을 되레 깎아내리는 사고를
막는다.
```

- [ ] **Step 3: 버전을 올린다**

`package.json`의 `"version": "1.4.7"` → `"version": "1.5.0"`.

- [ ] **Step 4: 전체 검증**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add supabase/dev-seed.sql docs/decisions.md package.json
git commit -m "쿠폰 발행·회수 절차와 결정을 적고 1.5.0으로 올린다"
```
