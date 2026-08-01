# 작품 식별 → 번역 맥락 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마법사의 작품 정보 화면에서 포스터 위계를 낮추고 카피를 "작품 식별"에서 "번역 맥락 입력"으로 바꾸며, 작품을 고르지 않고도 번역까지 갈 수 있는 경로를 만든다.

**Architecture:** 순수 UI·문자열 변경 3건 + 마법사 상태 전이 1건. enrich 로직·프롬프트·`tmdb.ts`·API 라우트는 건드리지 않는다. 확정 카드의 렌더 조건만 순수 함수로 추출해 테스트하고, 나머지는 타입 검사와 `PreviewHarness` 육안 확인으로 검증한다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, vitest 4 (node 환경, 순수 함수 전용)

**설계 문서:** `docs/superpowers/specs/2026-08-02-work-context-framing-design.md`

## Global Constraints

- **화면 문구 하드코딩 금지.** 모든 사용자 노출 문자열은 `app/i18n/simpleCopy.ts`의 `COPY`를 거친다 (CLAUDE.md 컨벤션).
- **enrich 파이프라인 불변.** `app/lib/server/enrichMovie.ts`, `app/lib/server/tmdb.ts`, `app/api/enrich/`, `app/lib/prompts/`는 이 계획에서 한 줄도 바꾸지 않는다. 따라서 CLAUDE.md의 "번역 관련 코드를 바꾸면 문서 지도도 같은 커밋에서" 트리거는 걸리지 않지만, §2-A의 UI 서술이 낡으므로 Task 6에서 갱신한다.
- **테스트 환경은 node.** `@testing-library/react`도 jsdom도 없다. React 컴포넌트를 렌더하는 테스트를 작성하지 말 것. 새 devDependency를 추가하지 말 것.
- **검증 명령 (전체):** `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`
- **개발 서버는 Bash로 띄우지 말 것.** 프리뷰는 Browser 도구 (`preview_start`)로.
- **커밋 메시지는 한국어 평서형** ("~한다"). 리포의 기존 커밋 스타일.

**커밋 분할이 스펙보다 잘게 쪼개진다.** 스펙 §8은 3개 커밋으로 묶었지만, 이
계획은 6개로 나눈다 — 각 태스크가 독립적으로 되돌릴 수 있고 리뷰어가 하나만
거절할 수 있는 단위여야 하기 때문이다. 대응 관계: 스펙 커밋 1 = Task 1·2·3,
스펙 커밋 2 = Task 4·5, 스펙 커밋 3 = Task 6.

---

### Task 1: 확정 카드에서 포스터를 제거한다

설정 화면의 확정 작품 카드는 확인이 이미 끝난 뒤에도 포스터를 크게 들고 있어, 미디어 라이브러리 인상의 주범이다. 포스터를 지우면 `COPY.info.posterAlt`, `COPY.info.posterEmpty`, `globals.css`의 `.poster` 규칙 3개가 전부 데드코드가 된다 (확인 완료: 이 카드가 유일한 사용처. 후보 카드는 Tailwind 유틸을 쓴다).

**Files:**
- Modify: `app/components/beta/TranslateSettingsStep.tsx:135-170`
- Modify: `app/globals.css:922-945`
- Modify: `app/i18n/simpleCopy.ts:308-309`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 없음. `--r-poster` CSS 토큰과 `COPY.workPick.posterEmpty`는 후보 카드가 계속 쓰므로 **삭제하지 않는다.**

- [ ] **Step 1: 확정 카드의 포스터 블록을 삭제한다**

`app/components/beta/TranslateSettingsStep.tsx`에서 `.card.detected` 블록(현재 135~170행)의 `<div className='poster'>` 전체를 지운다. 변경 후 이 블록은 이렇게 된다:

```tsx
      {contentType === 'movie' && !searching && !needsConfirm && (
        <div className='card detected mb-[14px]'>
          <div className='min-w-0'>
            <div className='dtitle truncate'>{movieInfo.title || '—'}</div>
            <div className='dmeta'>
              {movieInfo.year || '—'}
              {movieInfo.director &&
                ` · ${COPY.info.labelDirector} ${movieInfo.director}`}
            </div>
            <div className='dbadge'>
              <b />
              {COPY.info.detectedBadge}
            </div>
          </div>
          <button
            type='button'
            className='btn btn-ghost ml-auto self-start !px-3 !py-2 !text-caption'
            onClick={onChangeWork}
          >
            <PencilIcon />
            {c.changeWork}
          </button>
        </div>
      )}
```

- [ ] **Step 2: 죽은 CSS 규칙을 지운다**

`app/globals.css`에서 `.poster`, `.poster span`, `.poster img` 세 규칙(922~945행)을 통째로 삭제한다. 바로 위의 `.detected`와 바로 아래의 `.dtitle`은 **남긴다.**

`--r-poster` 토큰 정의는 건드리지 않는다 — `WorkPickStep`의 플레이스홀더가 `rounded-poster`로 쓰고 있고, Task 2에서 이미지도 이 토큰을 쓰게 된다.

- [ ] **Step 3: 죽은 COPY 키를 지운다**

`app/i18n/simpleCopy.ts`의 `info` 블록에서 두 줄을 삭제한다:

```ts
    posterAlt: (title: string) => `${title} 포스터`,
    posterEmpty: '포스터 없음',
```

`workPick` 블록의 `posterEmpty: 'poster',`는 **다른 키다. 남긴다.**

- [ ] **Step 4: 타입 검사로 데드코드 제거를 확인한다**

```bash
npx tsc --noEmit && npx eslint app
```

Expected: 통과. 만약 `Property 'posterAlt' does not exist` 같은 오류가 뜨면 Step 1에서 지우지 못한 참조가 남은 것이므로 그 파일을 고친다.

- [ ] **Step 5: 전체 테스트가 여전히 통과하는지 확인한다**

```bash
npx vitest run && npm run check:tokens
```

Expected: 전부 PASS. (`app/i18n/simpleCopy.test.ts`는 랜딩 CPS 수치 전용이라 영향받지 않는다.)

- [ ] **Step 6: 커밋**

```bash
git add app/components/beta/TranslateSettingsStep.tsx app/globals.css app/i18n/simpleCopy.ts
git commit -m "확정된 작품 카드에서 포스터를 뺀다 — 확인이 끝난 뒤엔 장식이다."
```

---

### Task 2: 후보 카드의 포스터를 썸네일 크기로 줄인다

포스터가 실제로 일하는 유일한 순간은 "리메이크 3개 중 어느 거지?"를 가를 때고, 그 일에는 썸네일이면 충분하다. 줄거리 2줄은 **유지한다** — 동명·리메이크 구분에는 포스터보다 줄거리가 더 잘 든다.

**Files:**
- Modify: `app/components/beta/WorkPickStep.tsx:196-216`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립 — 다른 컴포넌트, 다른 CSS 경로)
- Produces: 없음

- [ ] **Step 1: 카드 gap과 포스터 치수를 줄인다**

`app/components/beta/WorkPickStep.tsx`의 `CandidateCard`에서 세 군데를 바꾼다.

(a) 카드 루트의 `gap-[18px]` → `gap-[14px]`:

```tsx
      className='animate-zslide flex gap-[14px] items-center w-full text-left rounded-card p-4 px-5 border-[1.5px] transition hover:shadow-[var(--shadow-hover)] active:scale-[0.99]'
```

(b) 이미지 — `w-14 h-20` → `w-10 h-14`, `rounded-lg` → `rounded-poster` (지금 이미지만 토큰을 안 쓰는 불일치가 있다):

```tsx
        <img
          src={candidate.posterUrl}
          alt=''
          className='w-10 h-14 rounded-poster flex-none object-cover'
        />
```

(c) 플레이스홀더 — `w-14 h-20` → `w-10 h-14`:

```tsx
        <div className='w-10 h-14 rounded-poster flex-none bg-[image:var(--placeholder-stripe)] flex items-center justify-center mono text-micro text-quaternary'>
          {c.posterEmpty}
        </div>
```

- [ ] **Step 2: 타입 검사와 린트**

```bash
npx tsc --noEmit && npx eslint app
```

Expected: 통과.

- [ ] **Step 3: 프리뷰로 육안 확인**

Browser 도구로 `preview_start`(`.claude/launch.json`의 dev 서버 항목) 후 `/dev/preview`로 이동, 화면 선택기에서 `workPick`을 고른다.

확인할 것: 썸네일이 40×56으로 작아졌고, 제목·연도·줄거리가 카드의 시각적 무게 중심이 됐는지. 세 후보(`이터널 선샤인`/`메멘토`/`브레이킹 배드`)의 `posterUrl`은 하네스에서 전부 `null`이라 플레이스홀더 경로가 보인다 — 이미지 경로는 실제 앱에서 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add app/components/beta/WorkPickStep.tsx
git commit -m "후보 카드 포스터를 확인용 썸네일 크기로 줄인다."
```

---

### Task 3: 카피 프레임을 '작품 식별'에서 '번역 맥락'으로 바꾼다

화면이 실제로 하는 일은 작품 식별이 아니라 장르·시대·톤을 모아 번역 프롬프트에 넣는 것이다. 목적을 그대로 말하면 유도 인상이 사라지면서 기능 설명도 정확해진다.

기준점은 이미 있는 `settings.contextHint`("번역에 그대로 반영됩니다. 비워 두시면 자막 내용만으로 판단합니다.")다. 나머지를 이 톤에 맞춘다. **`contextHint`는 건드리지 않는다.**

**Files:**
- Modify: `app/i18n/simpleCopy.ts` (`upload`, `info`, `settings`, `workPick` 블록)

**Interfaces:**
- Consumes: Task 1이 지운 `info.posterAlt`/`info.posterEmpty`가 없는 상태의 `COPY`
- Produces: 없음. `workPick.skip`은 Task 5에서 추가한다 (버튼과 같은 커밋).

- [ ] **Step 1: 11개 문자열을 교체한다**

`app/i18n/simpleCopy.ts`에서 아래 값들을 바꾼다. **키 이름은 그대로 두고 값만** 바꾼다 — 키를 바꾸면 참조 사이트가 전부 깨진다.

`upload` 블록:
```ts
    readingSub: '타임코드를 분석하고 번역 맥락을 찾고 있어요',
```

`info` 블록:
```ts
    searching: '번역 맥락을 찾고 있습니다…',
    detectedBadge: '맥락 자동 입력됨',
```

`settings` 블록:
```ts
    confirmQuestion: (work: string) => `'${work}'의 맥락으로 번역할까요?`,
    changeWork: '맥락 변경',
    sectionWork: '번역 맥락',
```

`workPick` 블록:
```ts
    title: '번역에 참고할 작품 맥락',
    subtitle: '시대 배경과 장르를 알면 말투를 그에 맞춰 옮깁니다. 건너뛰어도 번역은 진행됩니다.',
    searchOpen: '직접 검색',
    searchHint: '제목으로 다시 검색합니다.',
    confirm: '이 맥락으로 번역',
```

`searchHint`의 원래 뒷문장("작품을 찾지 못해도 번역은 계속 진행할 수 있습니다.")은 삭제한다 — 그 약속은 Task 5의 실제 버튼이 담당한다. 위의 `searchHint` 바로 위에 달린 기존 주석(`enrich()는 제목+연도만 받는다…`)은 여전히 유효하므로 **남긴다.**

- [ ] **Step 2: `searchOpen`이 aria-label로도 쓰이는 것을 확인한다**

`WorkPickStep.tsx:171`이 검색 제출 버튼의 `aria-label`로 `c.searchOpen`을 쓴다. 값이 '찾는 작품이 없습니다'에서 '직접 검색'으로 바뀌면서 **오히려 정확해진다** (그 버튼은 검색을 실행하는 버튼이다). 코드 변경은 필요 없다. 확인만 하고 넘어간다.

- [ ] **Step 3: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

Expected: 전부 통과.

- [ ] **Step 4: 프리뷰로 세 화면 확인**

`/dev/preview`에서 `workPick`, `settings`, `settings:confirm`을 차례로 본다. 확인할 것: 어느 화면에도 "작품을 찾아준다"는 뉘앙스가 남아 있지 않은지, 그리고 `settings`의 `contextHint`와 새 문구들의 톤이 일관된지.

- [ ] **Step 5: 커밋**

```bash
git add app/i18n/simpleCopy.ts
git commit -m "작품 정보 화면 카피를 '식별'에서 '번역 맥락'으로 바꾼다."
```

---

### Task 4: 확정 카드 렌더 조건을 순수 함수로 추출한다

Task 5에서 skip 경로가 생기면 `movieInfo.title`이 빈 문자열인 채로 설정 화면에 도착한다. 현재 조건(`contentType === 'movie' && !searching && !needsConfirm`)으로는 제목이 `—`인 빈 카드가 렌더된다. 조건에 제목 존재 여부를 더하되, 이 리포는 컴포넌트를 렌더하는 테스트를 돌릴 수 없으므로(node 환경, jsdom 없음) 조건만 순수 모듈로 떼어내 테스트한다.

Task 5보다 **먼저** 하는 이유: 빈 카드 버그를 만들기 전에 막는 조건을 먼저 세운다.

**Files:**
- Create: `app/components/beta/workCard.ts`
- Create: `app/components/beta/workCard.test.ts`
- Modify: `app/components/beta/TranslateSettingsStep.tsx` (import 추가 + 조건 교체)

**Interfaces:**
- Consumes: `ContentType` (`app/types/translation.ts`에서 export되는 기존 타입)
- Produces: `shouldShowWorkCard(args: { contentType: ContentType; searching: boolean; needsConfirm: boolean; title: string }): boolean` — Task 5가 이 함수의 존재에 의존한다 (skip 경로가 빈 카드를 안 그리는 근거).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/components/beta/workCard.test.ts`를 만든다:

```ts
import { describe, it, expect } from 'vitest';
import { shouldShowWorkCard } from './workCard';

/**
 * 확정 작품 카드는 네 조건이 모두 맞을 때만 뜬다. 제목 조건이 마지막에
 * 추가된 이유는 '작품 정보 없이 번역' 경로 때문이다 — 그 경로는 movieInfo를
 * 빈 채로 설정 화면에 넘기므로, 제목을 안 보면 '—'만 든 빈 카드가 뜬다.
 */
describe('shouldShowWorkCard', () => {
  const base = {
    contentType: 'movie' as const,
    searching: false,
    needsConfirm: false,
    title: '이터널 선샤인',
  };

  it('작품이 확정된 영화 분기에서 카드를 보여준다', () => {
    expect(shouldShowWorkCard(base)).toBe(true);
  });

  it('제목이 없으면 카드를 숨긴다 — 작품 정보 없이 번역하는 경로', () => {
    expect(shouldShowWorkCard({ ...base, title: '' })).toBe(false);
  });

  it('제목이 공백뿐이어도 숨긴다', () => {
    // 그라운딩 폴백이 빈 값 대신 공백을 흘릴 수 있다.
    expect(shouldShowWorkCard({ ...base, title: '   ' })).toBe(false);
  });

  it('영화가 아닌 콘텐츠에는 카드가 없다 — 요약 카드가 그 자리를 쓴다', () => {
    expect(shouldShowWorkCard({ ...base, contentType: 'variety' })).toBe(false);
  });

  it('검색 중에는 카드 대신 스피너가 뜬다', () => {
    expect(shouldShowWorkCard({ ...base, searching: true })).toBe(false);
  });

  it('확인이 필요하면 카드 대신 확인 배너가 뜬다', () => {
    expect(shouldShowWorkCard({ ...base, needsConfirm: true })).toBe(false);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run app/components/beta/workCard.test.ts
```

Expected: FAIL — `Failed to resolve import "./workCard"`.

- [ ] **Step 3: 최소 구현을 쓴다**

`app/components/beta/workCard.ts`를 만든다:

```ts
import type { ContentType } from '../../types/translation';

/**
 * 설정 화면의 확정 작품 카드를 그릴지 판단한다.
 *
 * 컴포넌트 밖 순수 함수인 이유: 이 리포의 vitest는 node 환경이라 컴포넌트를
 * 렌더할 수 없는데(jsdom·@testing-library 없음), 이 조건은 실제 버그를
 * 막는다 — '작품 정보 없이 번역' 경로는 movieInfo를 빈 채로 넘기므로
 * 제목을 확인하지 않으면 '—'만 든 빈 카드가 렌더된다.
 */
export function shouldShowWorkCard({
  contentType,
  searching,
  needsConfirm,
  title,
}: {
  contentType: ContentType;
  searching: boolean;
  needsConfirm: boolean;
  title: string;
}): boolean {
  return (
    contentType === 'movie' &&
    !searching &&
    !needsConfirm &&
    title.trim() !== ''
  );
}
```

- [ ] **Step 4: 테스트 통과를 확인한다**

```bash
npx vitest run app/components/beta/workCard.test.ts
```

Expected: 6개 전부 PASS.

- [ ] **Step 5: 컴포넌트가 이 함수를 쓰게 한다**

`app/components/beta/TranslateSettingsStep.tsx` 상단 import에 추가:

```tsx
import { shouldShowWorkCard } from './workCard';
```

그리고 Task 1에서 손본 확정 카드 블록의 조건을 교체한다:

```tsx
      {shouldShowWorkCard({
        contentType,
        searching,
        needsConfirm,
        title: movieInfo.title,
      }) && (
        <div className='card detected mb-[14px]'>
```

`movieInfo.title || '—'` 안의 `|| '—'` 폴백은 이제 도달 불가능하지만, 그대로 둔다 — 조건 함수가 유일한 진실 공급원이고, 폴백을 지우면 두 곳이 같은 규칙을 알아야 한다.

다른 두 분기(`searching` 스피너 95행, `needsConfirm` 배너 101행)의 조건은 **바꾸지 않는다.** 그 둘은 제목 없이도 떠야 한다.

- [ ] **Step 6: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

Expected: 전부 통과.

- [ ] **Step 7: 커밋**

```bash
git add app/components/beta/workCard.ts app/components/beta/workCard.test.ts app/components/beta/TranslateSettingsStep.tsx
git commit -m "확정 작품 카드의 렌더 조건을 순수 함수로 떼어내 테스트한다."
```

---

### Task 5: '작품 정보 없이 번역' 경로를 만든다

`WorkPickStep`의 `canConfirm`은 영화 분기에서 `selectedIndex >= 0`을 요구해서, 후보를 고르지 않으면 진행이 막힌다. 그런데 `searchHint`는 진행할 수 있다고 약속하고 있었다(Task 3에서 그 문장을 지웠다). 코드가 약속을 지키게 만든다.

**Files:**
- Modify: `app/i18n/simpleCopy.ts` (`workPick.skip` 추가)
- Modify: `app/components/beta/WorkPickStep.tsx` (prop + 버튼)
- Modify: `app/hooks/useWizard.ts` (`skipWorkPick`)
- Modify: `app/page.tsx:212-232`
- Modify: `app/dev/preview/PreviewHarness.tsx`

**Interfaces:**
- Consumes: Task 4의 `shouldShowWorkCard` — 이 경로가 빈 확정 카드를 렌더하지 않는 근거.
- Produces:
  - `COPY.workPick.skip: string`
  - `WorkPickStepProps.onSkip: () => void`
  - `useWizard()` 반환값의 `skipWorkPick: () => void`

- [ ] **Step 1: COPY에 skip 문자열을 추가한다**

`app/i18n/simpleCopy.ts`의 `workPick` 블록, `confirm` 바로 아래에:

```ts
    // 후보를 고르지 않고 설정 화면으로 넘어가는 경로. 이 버튼이 없던 동안
    // searchHint가 "작품을 찾지 못해도 번역은 계속 진행할 수 있습니다"라고
    // 약속했지만 canConfirm이 selectedIndex를 요구해 실제로는 막혀 있었다.
    skip: '작품 정보 없이 번역',
```

- [ ] **Step 2: `WorkPickStep`에 `onSkip` prop과 버튼을 단다**

`app/components/beta/WorkPickStep.tsx`:

(a) `WorkPickStepProps`의 `// movie branch` 그룹에 추가:

```tsx
  onSkip: () => void;
```

(b) 컴포넌트 시그니처의 구조분해에 `onSkip`을 더하고, `MovieBranch` 호출에 넘긴다:

```tsx
        <MovieBranch
          candidates={candidates}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          onSearch={onSearch}
          searching={searching}
          onSkip={onSkip}
        />
```

(c) `MovieBranch`의 props 타입과 구조분해에 `onSkip: () => void`를 더한다.

(d) `MovieBranch`의 반환 JSX에서, "직접 검색" 토글을 감싼 `<div className='text-center'>`를 아래처럼 바꾼다 — 두 버튼을 한 줄에 두되 skip은 더 조용한 무게로:

```tsx
      <div className='flex items-center justify-center gap-4'>
        <button
          type='button'
          className='text-body text-ink-strong'
          onClick={() => setSearchOpen((v) => !v)}
        >
          {searchOpen ? c.searchClose : c.searchOpen}
        </button>
        <span className='text-quaternary' aria-hidden>
          ·
        </span>
        <button
          type='button'
          className='text-body text-secondary hover:text-ink-strong transition-colors'
          onClick={onSkip}
        >
          {c.skip}
        </button>
      </div>
```

`canConfirm` 로직은 **바꾸지 않는다.** skip은 확정 버튼을 우회하는 별도 경로다.

- [ ] **Step 3: `useWizard`에 `skipWorkPick`을 추가한다**

`app/hooks/useWizard.ts`, `confirmWorkPick`(543행) 바로 아래에:

```ts
  /**
   * 후보를 고르지 않고 설정 화면으로 넘어간다. confirmWorkPick의 영화 분기와
   * 달리 runSelectCandidate를 부르지 않으므로 /api/enrich 선택 모드 호출도,
   * 그에 딸린 그라운딩 호출도 일어나지 않는다. movieInfo는 빈 채로 두고,
   * 설정 화면의 장르·시대·톤 입력(이미 편집 가능)이 사용자 입력을 받는다.
   * 비워 두면 contextHint가 약속한 대로 자막 내용만으로 판단한다.
   */
  const skipWorkPick = useCallback(() => {
    setWorkConfirmed(true);
    // 자동 매치가 아니므로 설정 화면의 확인 배너는 뜨지 않는다.
    setAutoMatched(false);
    setScreen('settings');
  }, []);
```

그리고 반환 객체에서 `confirmWorkPick,` 바로 아래에 `skipWorkPick,`을 추가한다.

- [ ] **Step 4: `page.tsx`에 배선한다**

`app/page.tsx`:

(a) `useWizard()` 구조분해(85행 `confirmWorkPick,` 근처)에 `skipWorkPick,`을 추가한다.

(b) `<WorkPickStep>`의 `onConfirm={confirmWorkPick}` 바로 아래에:

```tsx
            onSkip={skipWorkPick}
```

- [ ] **Step 5: `PreviewHarness`에 배선하고 새 화면을 추가한다**

`app/dev/preview/PreviewHarness.tsx`:

(a) `<WorkPickStep>`의 `onConfirm={noop}` 바로 아래에 `onSkip={noop}`을 추가한다.

(b) `SCREENS` 배열에서 `'settings:searching',` 바로 뒤에 새 화면을 넣는다:

```tsx
  'settings:noWork',
```

(c) 제목 없는 `MovieInfo` 상수를 `MOVIE_INFO` 정의 바로 아래에 추가한다:

```tsx
/** '작품 정보 없이 번역' 경로가 설정 화면에 넘기는 상태 — 확정 카드가 뜨면 안 된다. */
const NO_WORK_INFO: MovieInfo = { title: '', year: '', notes: '' };
```

(`MovieInfo`의 `director`·`posterUrl`·`genre`·`era`·`tone`은 전부 optional이므로
필수 세 필드만 채운다. 이 경로가 실제로 만드는 상태가 그렇다.)

(d) `<TranslateSettingsStep>`의 `movieInfo` prop을 화면에 따라 고르게 바꾼다:

```tsx
            movieInfo={screen === 'settings:noWork' ? NO_WORK_INFO : movieInfo}
```

- [ ] **Step 6: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

Expected: 전부 통과. `onSkip`을 넘기지 않은 `WorkPickStep` 호출처가 있으면 tsc가 잡는다.

- [ ] **Step 7: 프리뷰로 두 화면을 확인한다**

`/dev/preview`에서:
- `workPick` — "직접 검색 · 작품 정보 없이 번역" 두 버튼이 한 줄에 있고, skip 쪽이 시각적으로 더 조용한지. 후보를 하나도 안 고른 상태에서도 skip 버튼이 눌리는 상태인지(확정 버튼은 비활성인 채로).
- `settings:noWork` — **확정 작품 카드가 아예 없고** 맥락 입력 카드(장르·시대·톤)와 품질 선택만 보이는지. `—`만 든 빈 카드가 보이면 Task 4의 조건이 안 걸린 것이다.

- [ ] **Step 8: 커밋**

```bash
git add app/i18n/simpleCopy.ts app/components/beta/WorkPickStep.tsx app/hooks/useWizard.ts app/page.tsx app/dev/preview/PreviewHarness.tsx
git commit -m "작품을 고르지 않고도 번역까지 가는 경로를 만든다 — 카피가 하던 약속을 코드가 지킨다."
```

---

### Task 6: 문서 지도를 갱신한다

CLAUDE.md는 번역 관련 코드 변경 시 문서 지도를 같은 커밋에서 갱신하라고 한다. 이번엔 enrich 로직을 안 건드렸지만 `translation-pipeline.md` §2-A의 UI 서술이 낡았고, 포지셔닝 근거는 `decisions.md`에 남겨야 나중에 되뒤집히지 않는다.

**Files:**
- Modify: `docs/decisions.md` (말미에 새 항목 추가)
- Modify: `docs/translation-pipeline.md` (§2-A의 후보 UI 서술 + 증상→파일 표)

**Interfaces:**
- Consumes: Task 1~5의 모든 변경
- Produces: 없음 (마지막 태스크)

- [ ] **Step 1: `decisions.md`의 번호 체계를 확인한다**

```bash
grep -n "^### 2-" docs/decisions.md | tail -5
```

기존 §2 계열의 마지막 번호를 확인하고 그 다음 번호를 쓴다. (§2-10이 TMDB 후보 선택 UI를 정한 항목이고, §2-11 이후가 있을 수 있다.)

- [ ] **Step 2: `decisions.md`에 결정을 기록한다**

확인한 번호로 항목을 추가한다. 다음 내용을 담을 것:

- **문제**: 포스터가 달린 세로 후보 리스트가 Plex·Infuse 같은 미디어 라이브러리 브라우징 문법으로 읽힌다. 도구의 법적 방어는 이미 갖춰져 있지만(비배포 구조, 저작권 동의 게이트), 이 인상은 TMDB 상업 라이선스 용도 심사와 결제 가맹점 심사에서 실제 비용이 된다.
- **결정**: 확정 카드에서 포스터를 제거하고 후보 카드는 썸네일로 축소. 카피를 "작품 식별"에서 "번역 맥락 입력"으로 전환. 작품을 고르지 않는 경로 추가.
- **안 한 것과 그 이유**: TMDB를 빼지 않았다. `enrichWithGrounding`이 이미 포스터 없는 폴백으로 존재해 락인이 아니고, TMDB 경로에서도 `extractKeywords`가 그라운딩 호출을 1번 하므로 제거해도 Gemini 비용은 줄지 않고 포스터·장르·cast 앵커만 잃는다.
- **참조**: `docs/superpowers/specs/2026-08-02-work-context-framing-design.md`

- [ ] **Step 3: `translation-pipeline.md` §2-A를 갱신한다**

```bash
grep -n "후보가 여러 개일 때\|WorkPickStep\|후보 카드" docs/translation-pipeline.md
```

찾은 자리에서 두 가지를 반영한다:
1. 후보 카드가 이제 썸네일 + 제목·연도·줄거리 중심이라는 것.
2. **사용자가 후보를 고르지 않고 건너뛸 수 있다**는 새 분기 — 이 경우 `runSelectCandidate`가 호출되지 않으므로 `lookupById`도 `extractKeywords`도 돌지 않고, 장르·시대·톤은 사용자가 설정 화면에서 직접 채우거나 비워 둔다.

- [ ] **Step 4: 증상→파일 표에 한 줄 더한다**

521~522행 근처의 표에 추가:

```
| 작품 정보 없이 번역했는데 확정 카드가 빈 채로 뜸 | `workCard.ts` (`shouldShowWorkCard`), `TranslateSettingsStep.tsx` |
```

- [ ] **Step 5: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

Expected: 전부 통과 (문서만 바뀌었으므로 당연히 통과해야 한다 — 통과하지 않으면 앞 태스크에 빠진 게 있다).

- [ ] **Step 6: 커밋**

```bash
git add docs/decisions.md docs/translation-pipeline.md
git commit -m "포스터 위계와 카피 프레임을 바꾼 근거를 문서 지도에 남긴다."
```

---

## 완료 후 확인

전체 흐름을 실제 앱에서 한 번 돌린다 (`/dev/preview`가 아니라 `/`):

1. 자막 파일 업로드 → 설정 화면으로 자동 이동, 검색 중 문구가 "번역 맥락을 찾고 있습니다…"인지.
2. 자동 매치된 경우 확인 배너가 "'{작품}'의 맥락으로 번역할까요?"인지, 확정 후 카드에 포스터가 없는지.
3. "맥락 변경" → 후보 화면 → 썸네일이 작고 줄거리가 잘 읽히는지.
4. "작품 정보 없이 번역" → 설정 화면에 확정 카드 없이 맥락 입력 카드만 뜨는지, 그 상태로 번역이 끝까지 도는지.

4번이 이 계획에서 유일하게 새로 생긴 런타임 경로다. 빈 `movieInfo`로 번역이 실제로 완주하는지 반드시 확인할 것.
