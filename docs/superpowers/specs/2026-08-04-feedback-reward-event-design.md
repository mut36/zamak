# 피드백 리워드 이벤트

작성 2026-08-04. 베타 기간 중 피드백을 적극적으로 받기 위해, 피드백 경로별로
번역권을 얹어주는 상시 이벤트. 기한 없음 — 당분간 유지하다 필요할 때 접는다.

---

## 1. 보상 구조

| 경로 | 보상 | 지급 방식 | 1인 한도 |
|---|---|---|---|
| 인앱 피드백/에러 보고 — 완료 화면 별점 또는 후속설문(`FeedbackFollowup`)에서 아무 응답이나 하나 | 라이트 1개 | **자동** | 1회 |
| 오픈카톡·이메일 문의 | 프로 1개 | **수동** (대표님이 SQL로) | 1회 |

두 경로는 서로 다른 이벤트로 취급한다 — 인앱 피드백을 남기고 카톡으로 추가
의견을 남기면 라이트 1개 + 프로 1개를 각각 받을 수 있다.

**"에러 보고"의 정의**: 별도 버그 신고 버튼은 만들지 않는다. 지금 있는
후속설문에서 `usability`(사용 불가 포함 4가지 중 하나)를 고르는 것 자체가
이미 "문제 보고"이므로, 완료 화면 별점(`rating`)이든 후속설문 응답
(`usability`)이든 **둘 중 하나만 있어도** 지급 대상이다. `dismiss`(나중에
버튼)는 지급하지 않는다.

## 2. 인앱 자동 지급

지금 크레딧이 늘어나는 경로는 가입 트리거(`grant_signup_credit`)와 결제 정산
(`settle_order`) 둘뿐이고, 둘 다 "정확히 언제 무엇을 줬는지"가 고정된
이벤트다. 이번 건은 "이 유저가 이 이벤트를 이미 받았는지"를 임의 시점에
확인하고 1회만 지급해야 하므로 같은 패턴을 하나 더 만든다.

### 2-1. 새 마이그레이션 `0012_event_grants.sql`

```sql
create table public.event_grants (
  user_id     uuid not null references auth.users(id),
  event_code  text not null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, event_code)
);
```

이벤트 하나에 종속시키지 않고 범용 지급 이력 테이블로 만든다 — 다음에 다른
이벤트가 생겨도 `event_code`만 새로 쓰면 되고, 유니크 제약(PK)이 중복 지급을
막아준다.

```sql
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
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.event_grants (user_id, event_code)
  values (v_user_id, p_event_code)
  on conflict (user_id, event_code) do nothing;

  if not found then
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

`begin_translation_job`과 같은 `security definer` + `auth.uid()` 패턴. insert
가 `on conflict do nothing`으로 막히면(`not found`) 그대로 반환하고 잔액은
건드리지 않는다.

이벤트 코드: 인앱 피드백은 `'feedback_reward_inapp'`, 고정 상수로
`app/config/constants.ts`에 둔다(오탈자로 인한 이중 지급 방지).

### 2-2. `/api/feedback` 라우트 변경

`hasRating || usability`가 있고(즉 `dismiss` 단독 호출이 아니고) `feedback`
upsert가 성공한 뒤, `grant_event_credit('feedback_reward_inapp', 'lite')`를
호출한다.

**실패해도 라우트 전체는 실패하지 않는다.** 피드백은 이미 저장됐는데 지급
실패로 사용자에게 에러가 뜨는 게 최악이다 — `reportServerError`처럼 지급
실패는 삼키고 로그만 남긴다(발생하면 나중에 수동 보정). 응답 바디에
`already_granted`나 `credits_granted`를 얹을지는 프론트가 지급 여부를 즉시
보여줄 필요가 있는지에 달렸는데, 이번 스코프에서는 "언젠가 라이트 1개
드렸어요" 정도의 정적 안내만 하면 되므로 응답에 안 얹는다 — 프론트는 매번
같은 안내 문구를 보여주고, 두 번째부터는 서버가 조용히 스킵한다.

## 3. 카톡·이메일 수동 지급

문의자가 가입 이메일을 남기면 대표님이 Supabase SQL 에디터에서 아래 스니펫을
실행한다. 서비스 롤로 붙는 수동 1회성 작업이라 `auth.uid()`를 쓰는
`grant_event_credit`을 그대로 재사용할 수 없다 — 같은 `event_grants` 테이블에
직접 쓰되 대상 유저를 이메일로 지정한다.

```sql
-- 이메일로 대상 확정, 이미 지급했으면 아무 일도 안 함
with target as (
  select id from auth.users where email = '문의자가_남긴_이메일'
)
insert into public.event_grants (user_id, event_code)
select id, 'feedback_reward_kakao_email' from target
on conflict (user_id, event_code) do nothing
returning user_id;

-- 위에서 실제로 한 줄이 insert됐을 때만 아래 실행
update public.credits set pro_balance = pro_balance + 1, updated_at = now()
 where user_id = (select id from auth.users where email = '문의자가_남긴_이메일');
```

이 스니펫은 `docs/TODO.md`에 "피드백 이벤트 수동 지급 절차"로 남겨 대표님이
바로 복붙해 쓸 수 있게 한다.

## 4. 카피·노출 위치

노출 위치는 두 곳 — 후속설문 근처(진입장벽이 가장 낮은 순간), 그리고 이미
`feedbackEmail` 링크가 있는 푸터. 마이페이지·랜딩은 이번 스코프에서 뺀다
(마이페이지는 상시 접근 지점이 아니고, 랜딩은 로그인 전이라 혜택을 바로 못
받는 방문자에게 기대만 심어준다).

`app/i18n/simpleCopy.ts` 변경:

- `feedbackFollowup.thanks` 근처(제출 완료 화면)에 안내 한 줄 추가 — 예:
  `"라이트 번역권 1개를 더 드렸어요. 더 자세한 의견은 오픈카톡이나 이메일로
  남겨주시면 프로 번역권으로 보답할게요."` (실제 문구는 구현 시 확정)
- `footer`에 오픈카톡 링크 + 짧은 이벤트 문구를 `feedbackEmail` 옆에 추가.
  카톡/이메일 문의 시 **가입할 때 쓴 이메일(또는 계정)을 남겨달라**는 안내를
  명시한다 — §3의 수동 지급이 이메일로 유저를 특정하기 때문.

`app/config/constants.ts`에 `KAKAO_OPEN_CHAT_URL` 상수를 추가한다. **이 URL은
대표님이 카카오에서 오픈채팅방을 직접 만들어야 나오는 값이라 이번 구현에서는
채울 수 없다** — 빈 문자열 또는 플레이스홀더로 두고, 채널 생성 후 URL을 받으면
채워 넣는다. 그 전까지는 카톡 링크 UI를 조건부로 숨기거나(URL 없으면 렌더 안
함) 렌더할지 구현 단계에서 정한다.

## 5. 영향 파일

```
supabase/migrations/0012_event_grants.sql   (신규) §2-1 테이블 + 함수
app/api/feedback/route.ts                   §2-2 지급 호출
app/config/constants.ts                     이벤트 코드 상수, KAKAO_OPEN_CHAT_URL
app/i18n/simpleCopy.ts                      §4 안내 문구
app/components/beta/FeedbackFollowup.tsx    §4 안내 문구 렌더
app/components/SiteFooter.tsx               §4 카톡 링크 + 문구
docs/TODO.md                                §3 수동 지급 SQL 스니펫 runbook
docs/decisions.md                           지급 방식이 왜 자동/수동으로
                                             갈렸는지 기록
```

## 6. 테스트

이 리포는 DB/route 레이어에 supabase 모킹 인프라가 없다(`/api/feedback`에
기존 route 테스트도 없음). `0004_credit_tiers.sql`이 실측 검증으로 확인했던
것과 같은 방식을 따른다:

- **수동 SQL 확인**: 같은 유저로 피드백을 두 번 제출해 `event_grants`에 행이
  하나만 생기고 `lite_balance`가 정확히 1만 오르는지 Supabase SQL 에디터에서
  확인.
- **수동 브라우저 확인**: 완료 화면 별점만 남긴 경우 / 후속설문 `usability`만
  고른 경우 / `later`(dismiss)만 누른 경우 각각 지급 여부가 맞는지.
- **전체 검증**: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`.

새 vitest 스펙은 추가하지 않는다 — 지급 로직의 핵심(중복 방지)은 DB 유니크
제약과 SQL 함수 안에 있고, 그건 vitest가 검증할 수 있는 대상이 아니다.

## 7. 커밋 분할

1. **DB** — `0012_event_grants.sql`
2. **자동 지급 배선** — `route.ts`, `constants.ts`(이벤트 코드)
3. **카피·UI** — `simpleCopy.ts`, `FeedbackFollowup.tsx`, `SiteFooter.tsx`,
   `constants.ts`(`KAKAO_OPEN_CHAT_URL`)
4. **문서** — `TODO.md`, `decisions.md`

## 8. 열어두는 것

- **오픈카톡 URL.** 대표님이 채널을 만드는 대로 상수만 채우면 된다.
- **지급 실패 시 사용자 노출.** 이번엔 "정적 안내 + 서버가 조용히 처리"로
  가지만, 지급 여부를 마이페이지 등에서 확인하고 싶어지면 `credits` 응답에
  `already_granted`를 얹는 건 나중에 붙이기 쉬운 확장이다.
- **이벤트 종료 시점.** 기한을 두기로 하면 `event_code`는 그대로 두고 라우트
  쪽에 날짜 체크만 추가하면 된다 — 스키마 변경 불필요.
