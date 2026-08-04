# 피드백 리워드 이벤트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인앱 피드백(별점/후속설문)을 남기면 라이트 번역권 1개를 자동으로,
오픈카톡·이메일로 문의하면 프로 번역권 1개를 대표가 수동으로 지급하는 상시
이벤트를 만든다.

**Architecture:** 범용 지급 이력 테이블 `event_grants(user_id, event_code)` +
`security definer` 함수 `grant_event_credit`을 새로 만들어, `/api/feedback`이
성공적인 피드백 제출 뒤 자동으로 호출한다. 카톡·이메일 경로는 코드를 안 타므로
`supabase/comp-credit.sql`(기존 수동 지급 런북)에 같은 테이블을 쓰는 스니펫을
추가한다. UI는 후속설문 완료 화면과 푸터 두 곳에 안내 문구 + 조건부 카톡 링크를
추가한다.

**Tech Stack:** Next.js App Router, Supabase(Postgres + `security definer`
RPC), TypeScript, vitest.

## Global Constraints

- 화면 문구는 하드코딩 금지 → `app/i18n/simpleCopy.ts`(`COPY`)에만 추가한다.
- 설정/상수는 `app/config/constants.ts` 한 곳에 모은다.
- 크레딧 잔액 컬럼은 `credits.lite_balance`/`credits.pro_balance`뿐이다 —
  deprecated `balance` 컬럼은 절대 쓰지 않는다.
- 지급 실패가 사용자에게 보이는 에러가 되면 안 된다 — 피드백 저장 자체는
  항상 성공 처리하고, 지급 실패는 `console.warn`으로만 남긴다
  (`app/api/feedback/pending/route.ts`의 기존 패턴과 동일).
- 오픈카톡 URL은 이번 구현 범위에서 실제 값을 못 채운다 — 빈 문자열
  기본값으로 두고 UI는 값이 있을 때만 카톡 관련 요소를 렌더링한다.
- 검증 명령: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`.
- 기능 단위 커밋(각 Task 끝에 한 번).

---

### Task 1: DB — `event_grants` 테이블 + `grant_event_credit` 함수

**Files:**
- Create: `supabase/migrations/0012_event_grants.sql`

**Interfaces:**
- Produces: SQL 함수 `public.grant_event_credit(p_event_code text, p_kind text) returns table(credits_granted integer, already_granted boolean)` — 이후 Task에서 `supabase.rpc('grant_event_credit', { p_event_code, p_kind })`로 호출.

이 리포는 DB 로직에 vitest 모킹 인프라가 없다(기존 `0004_credit_tiers.sql`도
같은 이유로 Supabase SQL 에디터에서 수동 검증했다 — `docs/decisions.md` §1-4).
그 관행을 그대로 따른다: 자동화 테스트 대신 SQL 에디터에서 직접 실행해
확인한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0012_event_grants.sql`:

```sql
-- ZAMAK: 이벤트 지급 이력 + 자동 지급 함수
--
-- Run this once in the Supabase SQL editor, after 0011_rate_limits_and_errors.sql.
--
-- 피드백 리워드 이벤트(인앱 피드백 → 라이트 1, 카톡·이메일 문의 → 프로 1)의
-- 기반이다. event_grants는 이번 이벤트 하나에 묶인 표가 아니라 **범용 지급
-- 이력**이다 — 다음에 다른 이벤트가 생겨도 event_code만 새로 쓰면 되고,
-- 기본키(user_id, event_code)가 중복 지급을 원천 차단한다.
--
-- api_rate_limits(0011)와 같은 이유로 RLS는 켜되 정책은 하나도 안 만든다 —
-- 이 표는 security definer 함수와 서비스 롤(수동 지급 SQL Editor 세션)을
-- 통해서만 읽고 쓴다.

create table if not exists public.event_grants (
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_code  text not null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, event_code)
);

alter table public.event_grants enable row level security;

-- 자기 계정으로 로그인한 유저가 자기 몫의 이벤트 크레딧을 스스로 요청하는
-- 함수. begin_translation_job(0004)과 같은 security definer + auth.uid() 패턴.
create or replace function public.grant_event_credit(
  p_event_code text,
  p_kind       text
)
returns table (credits_granted integer, already_granted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  -- row_count는 정수형이라 boolean이 아니라 integer로 받는다.
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.event_grants (user_id, event_code)
  values (v_user_id, p_event_code)
  on conflict (user_id, event_code) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return query select 0, true;
    return;
  end if;

  if p_kind = 'pro' then
    update public.credits set pro_balance = pro_balance + 1, updated_at = now()
     where user_id = v_user_id;
  else
    update public.credits set lite_balance = lite_balance + 1, updated_at = now()
     where user_id = v_user_id;
  end if;

  return query select 1, false;
end;
$$;

revoke all on function public.grant_event_credit(text, text) from public;
grant execute on function public.grant_event_credit(text, text) to authenticated;
```

- [ ] **Step 2: Supabase SQL 에디터에서 실행**

로컬/스테이징 Supabase 프로젝트의 SQL 에디터에 파일 내용을 붙여넣고 실행한다.
에러 없이 끝나야 한다.

- [ ] **Step 3: 수동 검증 — 최초 지급**

SQL 에디터에서 테스트 계정으로 로그인한 세션이 없으므로, `auth.uid()`를 흉내
낼 수 없다 — 대신 함수 자체를 호출하는 대신 **로직을 손으로 재현**해 확인한다:

```sql
-- 임의 테스트 유저 하나 선택
select id, email from auth.users limit 1;
-- 그 id로 아래를 두 번 실행
with target as (select 'PASTE_USER_ID_HERE'::uuid as uid)
insert into public.event_grants (user_id, event_code)
select uid, 'test_event' from target
on conflict (user_id, event_code) do nothing
returning *;
```

첫 실행은 1행을 반환(지급됨), 두 번째 실행은 0행(이미 지급됨, 중복 방지 확인).
확인 후 테스트 행은 지운다:

```sql
delete from public.event_grants where event_code = 'test_event';
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0012_event_grants.sql
git commit -m "$(cat <<'EOF'
event_grants 테이블 + grant_event_credit 함수를 추가한다 — 피드백 리워드 이벤트의 지급 기반.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 상수 — 이벤트 코드 + 카톡 URL

**Files:**
- Modify: `app/config/constants.ts`

**Interfaces:**
- Produces: `FEEDBACK_EVENT_CODE_INAPP: string`, `KAKAO_OPEN_CHAT_URL: string` — Task 3(route)과 Task 5/6(UI)이 각각 소비.

- [ ] **Step 1: `app/config/constants.ts` 끝에 추가**

파일 끝(마지막 export 다음)에 추가:

```ts
/**
 * 피드백 리워드 이벤트(2026-08)의 인앱 지급 코드. `event_grants.event_code`와
 * `grant_event_credit` 호출(`/api/feedback`)이 이 문자열로 일치해야 한다 —
 * 오탈자는 곧 이중 지급이나 무지급 버그다. 카톡·이메일 쪽 코드
 * ('feedback_reward_kakao_email')는 코드에서 안 읽으므로(수동 지급이라
 * `supabase/comp-credit.sql`에만 리터럴로 있음) 여기 두지 않는다.
 */
export const FEEDBACK_EVENT_CODE_INAPP = 'feedback_reward_inapp';

/**
 * 오픈카톡 채널 URL. 채널이 아직 없어 빈 문자열이 기본값이다 — 이 값이
 * 비어 있으면 푸터·피드백 완료 화면 모두 카톡 관련 UI를 렌더링하지 않는다.
 * 채널 생성 후 이 리터럴만 채우면 두 화면에 동시에 반영된다.
 */
export const KAKAO_OPEN_CHAT_URL = '';
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add app/config/constants.ts
git commit -m "$(cat <<'EOF'
피드백 이벤트 코드·오픈카톡 URL 상수를 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/api/feedback` — 자동 지급 배선

**Files:**
- Modify: `app/api/feedback/route.ts:117-127`

**Interfaces:**
- Consumes: `FEEDBACK_EVENT_CODE_INAPP`(Task 2), Supabase RPC `grant_event_credit(p_event_code, p_kind)`(Task 1).

지금 라우트 끝부분(117~127행)은 다음과 같다:

```ts
  const supabase = await createClient();
  const { error } = await supabase
    .from('feedback')
    .upsert(row, { onConflict: 'job_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가:

```ts
import { FEEDBACK_EVENT_CODE_INAPP } from '../../config/constants';
```

- [ ] **Step 2: upsert 성공 뒤, `dismiss` 단독 호출이 아닐 때만 지급 호출 추가**

위 블록을 아래로 교체:

```ts
  const supabase = await createClient();
  const { error } = await supabase
    .from('feedback')
    .upsert(row, { onConflict: 'job_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 별점(rating)이든 후속설문 응답(usability)이든, 실제 피드백을 남긴
  // 최초 제출에 한해 라이트 1개를 준다. dismiss 단독 호출(나중에 버튼)은
  // 대상이 아니다. 지급이 실패해도 피드백은 이미 저장됐으므로 라우트는
  // 그대로 성공을 반환한다 — app/api/feedback/pending/route.ts의 기존
  // "실패해도 사용자 화면은 안 깨진다" 패턴과 동일하다.
  if (hasRating || usability) {
    const { error: grantError } = await supabase.rpc('grant_event_credit', {
      p_event_code: FEEDBACK_EVENT_CODE_INAPP,
      p_kind: 'lite',
    });
    if (grantError) {
      console.warn('[feedback] event credit grant failed:', grantError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 타입 체크 + lint**

Run: `npx tsc --noEmit && npx eslint app`
Expected: 에러 없음.

- [ ] **Step 4: 수동 검증**

로컬 개발 서버(`npm run dev`, Browser 도구로 확인)에서:
1. 로그인 후 완료 화면에서 별점만 남긴다.
2. Supabase SQL 에디터에서 `select * from event_grants where event_code = 'feedback_reward_inapp';`로 행이 생겼는지, `select lite_balance from credits where user_id = '...';`로 잔액이 1 올랐는지 확인.
3. 같은 파일(같은 `jobId`)에 다시 별점을 남겨도(재제출) 잔액이 더 오르지 않는지 확인.
4. 후속설문(`FeedbackFollowup`)에서 `later`(dismiss)만 눌렀을 때는 `event_grants`에 행이 안 생기는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/api/feedback/route.ts
git commit -m "$(cat <<'EOF'
피드백 제출 시 라이트 번역권 1개를 자동 지급한다 — 피드백 리워드 이벤트.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 카피 추가

**Files:**
- Modify: `app/i18n/simpleCopy.ts:699-731` (`feedbackFollowup`)
- Modify: `app/i18n/simpleCopy.ts:752-762` (`footer`)

**Interfaces:**
- Produces: `COPY.feedbackFollowup.eventNote(hasKakao: boolean): string`, `COPY.feedbackFollowup.kakaoLink: string`, `COPY.footer.eventBadge(hasKakao: boolean): string`, `COPY.footer.kakaoLink: string` — Task 5·6이 각각 소비.

- [ ] **Step 1: `feedbackFollowup`에 두 키 추가**

`failed: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',` 다음 줄(730행
바로 뒤, 닫는 `},` 앞)에 추가:

```ts
    failed: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    eventNote: (hasKakao: boolean) =>
      hasKakao
        ? '라이트 번역권 1개를 더 드렸어요. 더 자세한 의견은 오픈카톡이나 이메일로 남겨주시면 프로 번역권으로 보답할게요. (가입할 때 쓴 이메일을 꼭 남겨주세요)'
        : '라이트 번역권 1개를 더 드렸어요. 더 자세한 의견은 이메일로 남겨주시면 프로 번역권으로 보답할게요. (가입할 때 쓴 이메일을 꼭 남겨주세요)',
    kakaoLink: '오픈카톡으로 의견 남기기',
  },
```

(기존 `},`는 지우고 위 블록의 `},`로 대체 — 즉 두 키를 `failed` 다음, 객체
닫는 중괄호 앞에 끼워 넣는다.)

- [ ] **Step 2: `footer`에 두 키 추가**

`copyright: '© 2026 ZAMAK. All rights reserved.',` 다음 줄(761행 바로 뒤,
닫는 `},` 앞)에 추가:

```ts
    copyright: '© 2026 ZAMAK. All rights reserved.',
    eventBadge: (hasKakao: boolean) =>
      hasKakao
        ? '피드백 이벤트: 오픈카톡·이메일로 의견 주시면 번역권을 더 드려요.'
        : '피드백 이벤트: 이메일로 의견 주시면 번역권을 더 드려요.',
    kakaoLink: '오픈카톡 문의',
  },
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

이 Task는 Task 5(렌더링)와 함께 커밋한다 — 카피만 추가하고 아무 데서도 안
쓰면 미사용 export는 아니지만(객체 프로퍼티라 lint가 안 잡는다) 검토
시점에서 "왜 있는지" 알 수 없는 죽은 문자열이 된다. Task 5로 넘어간다.

---

### Task 5: 후속설문 완료 화면에 안내 렌더

**Files:**
- Modify: `app/components/beta/FeedbackFollowup.tsx:1-12` (import), `:158-168` (렌더)

**Interfaces:**
- Consumes: `COPY.feedbackFollowup.eventNote`/`kakaoLink`(Task 4), `KAKAO_OPEN_CHAT_URL`(Task 2).

지금 제출 완료 블록(158~168행):

```tsx
        {submitStatus === 'sent' ? (
          <div className='text-center py-4'>
            <p className='text-body text-nav'>{c.thanks}</p>
            <button
              type='button'
              className='btn btn-ghost btn-block mt-5'
              onClick={onDone}
            >
              {c.close}
            </button>
          </div>
        ) : (
```

- [ ] **Step 1: import에 상수 추가**

파일 상단 import 블록(10행 `COPY` import 다음)에 추가:

```tsx
import { COPY } from '../../i18n/simpleCopy';
import { KAKAO_OPEN_CHAT_URL } from '../../config/constants';
```

- [ ] **Step 2: 완료 블록 교체**

```tsx
        {submitStatus === 'sent' ? (
          <div className='text-center py-4'>
            <p className='text-body text-nav'>{c.thanks}</p>
            <p className='mt-2 text-caption text-secondary'>
              {c.eventNote(Boolean(KAKAO_OPEN_CHAT_URL))}
            </p>
            {KAKAO_OPEN_CHAT_URL && (
              <a
                href={KAKAO_OPEN_CHAT_URL}
                target='_blank'
                rel='noopener noreferrer'
                className='mt-2 inline-block text-caption underline text-nav'
              >
                {c.kakaoLink}
              </a>
            )}
            <button
              type='button'
              className='btn btn-ghost btn-block mt-5'
              onClick={onDone}
            >
              {c.close}
            </button>
          </div>
        ) : (
```

- [ ] **Step 3: 타입 체크 + lint**

Run: `npx tsc --noEmit && npx eslint app`
Expected: 에러 없음.

- [ ] **Step 4: Browser 도구로 수동 확인**

`npm run dev` → Browser 도구로 `preview_start` → 로그인 후 후속설문을
끝까지 제출 → 완료 화면에 안내 문구가 뜨는지 확인(현재 `KAKAO_OPEN_CHAT_URL`이
빈 문자열이므로 카톡 링크는 안 보이는 게 정상 — 이메일 버전 문구가 보여야
한다). `read_page`로 텍스트가 실제로 렌더됐는지 확인.

- [ ] **Step 5: 커밋 (Task 4 + 5 함께)**

```bash
git add app/i18n/simpleCopy.ts app/components/beta/FeedbackFollowup.tsx
git commit -m "$(cat <<'EOF'
후속설문 완료 화면에 피드백 이벤트 안내를 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 푸터에 안내 + 카톡 링크

**Files:**
- Modify: `app/components/SiteFooter.tsx:1-6` (import), `:28-40` (렌더)

**Interfaces:**
- Consumes: `COPY.footer.eventBadge`/`kakaoLink`(Task 4), `KAKAO_OPEN_CHAT_URL`(Task 2).

지금 상단 블록(28~40행):

```tsx
      <div className='site-footer-top'>
        <div>
          <Wordmark className='lp-wordmark' />
          <p className='site-footer-tagline'>{F.tagline}</p>
        </div>

        <nav className='site-footer-links'>
          <div>
            <p className='site-footer-group'>{F.serviceGroup}</p>
            <Link href='/'>{F.home}</Link>
            <Link href='/mypage'>{F.mypage}</Link>
            <a href={`mailto:${F.feedbackEmail}`}>{F.feedback}</a>
          </div>
```

- [ ] **Step 1: import에 상수 추가**

```tsx
import { APP_VERSION, KAKAO_OPEN_CHAT_URL } from '../config/constants';
```

- [ ] **Step 2: 태그라인 아래 이벤트 문구, 피드백 링크 옆 카톡 링크 추가**

```tsx
      <div className='site-footer-top'>
        <div>
          <Wordmark className='lp-wordmark' />
          <p className='site-footer-tagline'>{F.tagline}</p>
          <p className='site-footer-tagline'>
            {F.eventBadge(Boolean(KAKAO_OPEN_CHAT_URL))}
          </p>
        </div>

        <nav className='site-footer-links'>
          <div>
            <p className='site-footer-group'>{F.serviceGroup}</p>
            <Link href='/'>{F.home}</Link>
            <Link href='/mypage'>{F.mypage}</Link>
            <a href={`mailto:${F.feedbackEmail}`}>{F.feedback}</a>
            {KAKAO_OPEN_CHAT_URL && (
              <a href={KAKAO_OPEN_CHAT_URL} target='_blank' rel='noopener noreferrer'>
                {F.kakaoLink}
              </a>
            )}
          </div>
```

- [ ] **Step 3: 타입 체크 + lint**

Run: `npx tsc --noEmit && npx eslint app`
Expected: 에러 없음.

- [ ] **Step 4: Browser 도구로 수동 확인**

아무 페이지(예: 랜딩 `/`)에서 푸터를 스크롤해 이벤트 문구가 보이는지, 카톡
링크는 `KAKAO_OPEN_CHAT_URL`이 비어 있으므로 안 보이는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/components/SiteFooter.tsx
git commit -m "$(cat <<'EOF'
푸터에 피드백 이벤트 안내를 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 카톡·이메일 수동 지급 런북

**Files:**
- Modify: `supabase/comp-credit.sql`

**Interfaces:**
- Consumes: `event_grants` 테이블(Task 1).

기존 `comp-credit.sql`은 이메일로 요청받은 콤프 지급·실패 복구용 런북이다.
같은 패턴(이메일 치환 → 실행 → 확인)으로 카톡·이메일 문의 보상 섹션을
추가한다. **다만 이 섹션은 `event_grants`에도 기록을 남긴다** — 콤프
지급(위 섹션)과 달리 이벤트 보상은 "1인 1회"가 지켜져야 하므로, 지급 이력이
없으면 대표가 실수로 같은 사람에게 두 번 프로를 줄 수 있다.

- [ ] **Step 1: 파일 끝에 새 섹션 추가**

`supabase/comp-credit.sql` 맨 아래(현재 마지막 블록인 "복구 대상 찾기"
쿼리 다음)에 추가:

```sql

-- ═══════════════ 피드백 이벤트: 카톡·이메일 문의 → 프로 1개 (2026-08) ═══
--
-- 오픈카톡이나 hello@mut36.com으로 의견을 남긴 사람에게 프로 번역권 1개.
-- 인앱 피드백(별점/후속설문)은 이미 자동 지급되므로 이 섹션은 그 경로를
-- 안 타는 카톡·이메일 문의 전용이다.
--
-- event_grants에 기록을 남겨 같은 사람에게 두 번 지급하는 실수를 막는다 —
-- 이미 받은 사람은 두 번째 insert가 0행으로 끝나고 아래 update도 안 돈다.
--
-- 사용법: 'YOUR_EMAIL_HERE'를 문의자가 남긴 가입 이메일로 치환 후 전체 실행.

with target as (
  select id from auth.users where email = 'YOUR_EMAIL_HERE'
),
grant_attempt as (
  insert into public.event_grants (user_id, event_code)
  select id, 'feedback_reward_kakao_email' from target
  on conflict (user_id, event_code) do nothing
  returning user_id
)
update public.credits
   set pro_balance = pro_balance + 1,
       updated_at  = now()
 where user_id in (select user_id from grant_attempt);

-- 확인: 1행이 나오면 이번에 지급된 것, 0행이면 이미 지급됐거나 이메일이
-- 안 맞는 것이다(아래 조회로 어느 쪽인지 구분).
select
  u.email,
  eg.granted_at,
  c.pro_balance
from auth.users u
left join public.event_grants eg
  on eg.user_id = u.id and eg.event_code = 'feedback_reward_kakao_email'
left join public.credits c on c.user_id = u.id
where u.email = 'YOUR_EMAIL_HERE';
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/comp-credit.sql
git commit -m "$(cat <<'EOF'
카톡·이메일 문의 보상 수동 지급 스니펫을 comp-credit.sql에 추가한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 문서 갱신 + 버전 업데이트

**Files:**
- Modify: `docs/decisions.md`
- Modify: `docs/TODO.md`
- Modify: `app/config/constants.ts:16` (`APP_VERSION`)
- Modify: `package.json:3` (`version`)

CLAUDE.md 지시사항: 구현이 끝나면 문서 지도와 버전을 갱신한다.

- [ ] **Step 1: `docs/decisions.md`에 결정 기록 추가**

"1. 과금·접근 모델" 섹션 마지막 항목(§1-7) 다음에 새 하위 항목 추가:

```markdown
### 1-8. 피드백 리워드 이벤트 — 인앱 자동, 카톡·이메일 수동 — 2026-08-04

인앱 피드백(별점/후속설문)과 카톡·이메일 문의를 서로 다른 지급 방식으로
갈랐다. **이유**: 인앱은 이미 `auth.uid()`로 유저가 특정되지만, 카톡·이메일은
앱 밖 채널이라 "누구에게 줄지"를 코드가 알 방법이 없다. 문의자가 가입
이메일을 남기는 것으로 대신하고, 대표가 `supabase/comp-credit.sql`로 수동
지급한다 — 이벤트 규모(베타)에서는 admin UI를 새로 만드는 비용이 안 맞는다.

두 경로 모두 새 `event_grants(user_id, event_code)` 테이블로 1인 1회를
보장한다. 이벤트 하나에 종속된 표가 아니라 범용 지급 이력으로 설계했다 —
다음 이벤트도 `event_code`만 새로 쓰면 재사용된다.

기한은 두지 않았다(2026-08-04 대표 결정) — 당분간 상시로 운영하다 필요할 때
접는다. 상세 설계는
`docs/superpowers/specs/2026-08-04-feedback-reward-event-design.md`.
```

- [ ] **Step 2: `docs/TODO.md`에 오픈카톡 URL 항목 추가**

`## 베타` 섹션 상단(가장 최근 항목들 위, "### 베타 오픈 당일 남긴 것" 앞)에
새 하위 섹션 추가:

```markdown
### 피드백 리워드 이벤트 — 오픈카톡 URL 채우기 (2026-08-04)

`app/config/constants.ts`의 `KAKAO_OPEN_CHAT_URL`이 빈 문자열이다. 대표가
카카오에서 오픈채팅방을 만든 뒤 URL을 이 상수에 채우면 푸터와 피드백
완료 화면 양쪽에 카톡 링크가 자동으로 뜬다(코드 변경 없음 — 두 화면 모두
이 상수가 비어 있는지로 조건부 렌더링한다).

- [ ] 오픈카톡 채널 생성 (대표)
- [ ] `KAKAO_OPEN_CHAT_URL`에 URL 반영
```

- [ ] **Step 3: 버전 업데이트**

`app/config/constants.ts:16`:

```ts
export const APP_VERSION = '1.4.0';
```

`package.json:3`:

```json
  "version": "1.4.0",
```

- [ ] **Step 4: 전체 검증**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`
Expected: 전부 통과. (`constants.test.ts`의 `APP_VERSION`이 `package.json`과
일치하는지 보는 테스트가 있으므로 두 파일을 반드시 같이 바꿔야 한다.)

- [ ] **Step 5: 커밋**

```bash
git add docs/decisions.md docs/TODO.md app/config/constants.ts package.json
git commit -m "$(cat <<'EOF'
피드백 리워드 이벤트 결정 기록·후속 TODO를 남기고 버전을 1.4.0으로 올린다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## 구현 순서 요약

Task 1 → 2 → 3 (자동 지급 경로 완성, 이 시점에 이미 기능 동작) → 4+5 (후속설문
UI) → 6 (푸터 UI) → 7 (수동 지급 런북) → 8 (문서·버전).

Task 1~3만 끝나도 "피드백 남기면 라이트 1개"는 이미 동작한다 — 4~6은 그
사실을 사용자에게 보여주는 레이어이고, 7~8은 나머지 경로와 기록이다. 중간에
멈춰도 각 지점에서 리포는 정상 동작 상태다.
