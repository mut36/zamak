# 쿠폰 코드 = 기간제 무제한 (설계)

2026-08-21

## 무엇을 만드는가

지인에게 비밀코드를 하나 주면, 그 사람이 앱에서 코드를 입력해 **일정 기간 동안
번역권 차감 없이** 쓰게 된다. 첫 코드는 `세르지오` — 30일, 최대 10명.

## 왜 이 모양인가

새 개념을 만들지 않는다. 0013이 이미 `unlimited_testers`라는 "차감 면제
allowlist"를 갖고 있고, 차감은 `begin_translation_job` **한 곳**에서만 일어난다.
여기에 만료일 컬럼 하나를 붙이면 그대로 기간제 무제한이 된다. 쿠폰 표는 그
allowlist에 **본인을 등록하는 입구**일 뿐, 별도의 권한 체계가 아니다.

크레딧 N편 지급이 아니라 기간제 무제한을 고른 이유: 지인 대상이라 남용 위험이
낮고, "몇 편 남았나"를 신경 쓰게 하는 순간 선물의 성격이 사라진다. 손실 상한은
편수가 아니라 기간으로 막는다.

## 스키마 (`supabase/migrations/0014_coupons.sql`)

두 프로젝트(개발용·배포용) 모두에 실행한다.

### unlimited_testers 확장

```
alter table public.unlimited_testers
  add column if not exists expires_at timestamptz;
```

`null` = 무기한. 기존 운영자 행은 손대지 않아도 그대로 무기한으로 남는다.

### coupons

| 컬럼 | 의미 |
|---|---|
| `code` text primary key | 정규화된 코드 (아래 규칙) |
| `duration_days` integer not null | 지급 기간 |
| `max_redemptions` integer | null = 인원 무제한 |
| `redeemed_count` integer not null default 0 | 사용 인원 |
| `valid_until` timestamptz | 코드 자체의 수명. null = 무기한 |
| `active` boolean not null default true | 회수 스위치 |
| `note` text | 누구에게 뿌린 코드인지 |
| `created_at` timestamptz not null default now() | |

RLS는 켜되 정책을 만들지 않는다 — `api_rate_limits`(0011)·`event_grants`(0012)와
같은 이유로, 이 표는 security definer 함수와 서비스 롤로만 읽고 쓴다. 클라이언트가
coupons를 select할 수 있으면 비밀코드가 비밀이 아니게 된다.

### coupon_redemptions

`(code, user_id)` 복합 기본키 + `redeemed_at`. 중복 사용 차단이 기본키 제약
그 자체다(`event_grants`와 같은 패턴). `event_grants`에 얹지 않고 별도 표로 두는
이유: `event_code` 네임스페이스에 쿠폰이 섞이면 이벤트 지급 이력 집계가 지저분해진다.

### 코드 정규화

`normalize_coupon_code(text)` = `trim` → 모든 공백 제거 → `upper` → NFC 정규화.
한글에 `upper`는 무해하고, 영문 코드를 섞어 발행할 때를 대비해 남긴다. 모바일
IME가 붙이는 앞뒤 공백과 중간 공백을 흡수하는 게 실제 목적이다. **클라이언트와
DB 양쪽에서 같은 규칙을 적용**하되, 신뢰하는 쪽은 DB다.

## redeem_coupon(p_code text)

security definer, `begin_translation_job`·`grant_event_credit`과 같은
`auth.uid()` 패턴.

1. `auth.uid()`가 없으면 `28000`.
2. 코드 정규화 후 조회. 없거나 / `active = false` / `valid_until < now()` /
   `redeemed_count >= max_redemptions` → **전부 같은 사유 `invalid`로 반환**.
   존재 여부를 구분해 알려주면 그게 열거 힌트가 된다.
3. `coupon_redemptions` insert `on conflict do nothing`.
   `row_count = 0`이면 `already_redeemed` 반환 — 이것만 따로 구분한다
   (사용자가 "왜 안 되지" 하고 재시도하는 걸 막는 실용적 이유).
4. `unlimited_testers` upsert:
   `expires_at = greatest(coalesce(기존 expires_at, now()), now()) + duration_days`.
   **연장 누적**이므로 아직 유효한 사람이 다른 코드를 넣어도 남은 기간이 깎이지
   않는다. 기존 행의 `expires_at`이 `null`(운영자 무기한)이면 갱신하지 않는다 —
   쿠폰이 무기한 계정의 권한을 되레 깎아내리면 안 된다.
5. `redeemed_count` 증가.
6. `(status text, expires_at timestamptz)` 반환. status ∈ `ok` |
   `already_redeemed` | `invalid`.

3~5는 한 트랜잭션이다. 동시 요청은 coupons 행 잠금으로 직렬화되어
`max_redemptions`를 넘길 수 없다.

## 만료를 실제로 먹이는 곳

여기가 빠지면 영구 무제한이 된다. 두 군데다.

- `begin_translation_job` replace — allowlist `exists` 조건에
  `and (expires_at is null or expires_at > now())` 추가. 시그니처가 같으므로
  drop 없이 replace(grant 유지). 0013판의 나머지 동작은 그대로.
- `/api/credits` — 같은 조건으로 조회. 무제한이면 `expiresAt`을 함께 내려보내
  화면이 남은 기간을 보여줄 수 있게 한다.

## 라우트 — `POST /api/coupons/redeem`

`requireUser` + 0011 `api_rate_limits` 재사용(시간당 상한). 지인용 비밀코드라도
무차별 대입은 막아야 한다. 본문은 `{ code: string }`, 길이 상한을 두고 자른다.
응답은 `{ status, expiresAt }`을 그대로 전달하고, 문구 결정은 클라이언트가 한다.

## UI

- 설정 화면에 코드 입력 한 칸 + 결과 문구.
- 잔액 칩: 무제한이면 `무제한 · 9/20까지`.
- 모든 문구는 `app/i18n/simpleCopy.ts`의 `COPY`. 하드코딩 금지.

## 발행·회수

어드민 화면은 만들지 않는다. SQL Editor에서:

```
insert into public.coupons (code, duration_days, max_redemptions, note)
values ('세르지오', 30, 10, '지인 배포 2026-08');
```

회수는 `update public.coupons set active = false where code = '세르지오';`
현황은 `select code, redeemed_count, max_redemptions from public.coupons;`
스니펫은 `supabase/dev-seed.sql`에 블록으로 추가한다.

## 테스트

- 코드 정규화·응답 분기는 순수 함수로 분리해 vitest.
- 라우트는 rpc를 모킹해 status별 응답을 검증.
- DB 함수 자체(연장 누적, 정원 초과, 중복 사용)는 dev-seed 검증 블록으로 수동 확인.

## 영향 없는 것

번역 파이프라인(`docs/translation-pipeline.md`)은 건드리지 않는다. CLAUDE.md의
불변식 4개 모두 무관하다. 새 환경변수 없음.

## 설정값

| 항목 | 값 |
|---|---|
| 첫 코드 | `세르지오` |
| 기간 | 30일 |
| 코드당 인원 | 10명 |
