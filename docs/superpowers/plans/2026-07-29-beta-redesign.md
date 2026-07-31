# ZAMAK 베타 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로토타입 디자인으로 앱 전체를 리디자인해 비공개 베타를 오픈할 수 있는 상태로 만든다.

**Architecture:** 위저드(업로드→작품→설정→진행→완료)는 단일 클라이언트 페이지의 상태 머신으로 유지하되, 그 상태 머신을 `page.tsx`에서 `useWizard` 훅으로 빼내 렌더링과 전이 로직을 분리한다. 번역 파이프라인(`app/lib/srt.ts`, `translationService.ts`, `prompts/`)은 **건드리지 않는다** — 이번 작업은 UI·과금 단위·결과물 보관만 바꾼다. 백엔드는 Supabase 마이그레이션 5건과 라우트 4개가 추가되고, 기존 `credits.balance` 단일 잔액이 라이트/프로 2종으로 확장된다.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4 (`@theme`), Supabase (Postgres + Auth + Storage), TypeScript, Vitest

## Global Constraints

- **화면 문구는 컴포넌트에 하드코딩 금지** → 전부 `app/i18n/simpleCopy.ts`의 `COPY` 객체에. 예외 없음.
- **설정·상수는 `app/config/constants.ts` 한 곳.**
- **번역 파이프라인 무변경**: `app/lib/srt.ts`, `app/lib/server/translationService.ts`, `prompts/`, `app/lib/prompts/`를 수정하지 않는다. 수정이 필요해 보이면 멈추고 보고한다.
- **CLAUDE.md 불변식 4개 유지**: ① 청크 입력 블록 수 = 출력 블록 수 ② 타임코드는 코드가 복원 ③ 청크 크기 상한 유지 ④ UI 버킷 / AI 버킷 / 글로사리 버킷 분리. 특히 ④ — 용어집 토글이 꺼지면 `<glossary>`·`<speech_relations>` 태그가 프롬프트에 아예 나타나지 않아야 한다.
- **모델 상수명 불변**: `FLASH_MODEL`(`gemini-3.6-flash`) / `PRO_MODEL`(`gemini-3.1-pro-preview`)과 `AllowedModel` 타입을 그대로 쓴다. **화면 문구만** "라이트" / "프로"로 바꾼다.
- **디자인 토큰 값 (프로토타입 원본)**: 배경 `#f5f5f7` · 카드 `#ffffff` · 인풋 `#fbfbfd` · 잉크(액션) `#161614` · 본문 `#1d1d1f` · 보조 `#6e6e73` / `#86868b` / `#a1a1a6` · 강조 `#FFD84D` · 성공 `#34c759` · 실패 `#ff3b30` · 테두리 `rgba(0,0,0,0.12)` · radius 카드 16px / 큰카드 20px / pill 999px · 그림자 `0 1px 2px rgba(0,0,0,0.04)`, hover `0 8px 30px rgba(0,0,0,0.05)`
- **라이트 전용** (다크모드 미지원).
- **검증 명령** (매 태스크 종료 전): `npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run`
- **개발 서버는 Bash로 띄우지 않는다** — Browser 도구(`preview_start`)를 쓴다.
- **커밋은 기능 단위**, 한국어 커밋 메시지 (기존 리포 관례). 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Google OAuth 로그인이 필요한 화면은 Claude가 검증할 수 없다.** 로그인 후 화면은 tsc/eslint/vitest까지만 확인하고 육안 검증은 대표에게 남긴다. 랜딩·비로그인 경로는 Browser로 직접 검증한다.
- **컴포넌트 테스트 도구가 없다** (`@testing-library`가 devDependencies에 없음). 따라서 TDD는 **순수 로직**(파생 계산, 스테이지 가중치, 리포트 산출, SQL 함수 계약을 반영한 클라이언트 헬퍼)에만 적용한다. UI 컴포넌트는 tsc/eslint + Browser 검증으로 대신한다. 없는 테스트를 쓴 척하지 않는다.

---

## File Structure

### 새로 만드는 파일

| 경로 | 책임 |
|---|---|
| `supabase/migrations/0004_credit_tiers.sql` | `credits`를 lite/pro 2잔액으로 확장, `begin_translation_job`에 모델 인자 추가, `grant_credits`에 종류 인자 추가 |
| `supabase/migrations/0005_feedback.sql` | 별점·의견 테이블 |
| `supabase/migrations/0006_waitlist.sql` | 결제 오픈 대기자 |
| `supabase/migrations/0007_job_results.sql` | `translation_jobs`에 결과물 메타 컬럼 + Storage 정책 |
| `supabase/migrations/0008_copyright_consents.sql` | 저작권 동의 기록 |
| `app/api/feedback/route.ts` | POST — 별점·의견 저장 |
| `app/api/waitlist/route.ts` | POST — 대기자 등록 |
| `app/api/translation/result/route.ts` | POST — 완성된 `.ko.srt`를 Storage에 저장 |
| `app/api/translation/history/route.ts` | GET — 내 번역 기록 + signed URL |
| `app/api/consent/route.ts` | GET/POST — 저작권 동의 조회·기록 |
| `app/lib/client/feedback.ts` | 피드백 POST 클라이언트 헬퍼 |
| `app/lib/client/waitlist.ts` | 대기자 POST 헬퍼 |
| `app/lib/jobHistory.ts` | 번역 기록 공용 타입 + 만료 판정 (서버·클라 공용) |
| `app/lib/client/history.ts` | 기록 조회 + 결과물 업로드 fetch 헬퍼 |
| `app/lib/client/consent.ts` | 동의 조회·기록 헬퍼 |
| `app/hooks/useWizard.ts` | 위저드 상태 머신 (화면 전이, 파일·작품·설정 상태) |
| `app/lib/progressStages.ts` | 진행 화면 4스테이지 파생 계산 (순수 함수) |
| `app/lib/progressStages.test.ts` | 위 테스트 |
| `app/lib/doneReport.ts` | 완료 화면 리포트 항목 산출 (순수 함수) |
| `app/lib/doneReport.test.ts` | 위 테스트 |
| `app/components/beta/AppNav.tsx` | 로그인 후 상단 고정 네비 |
| `app/components/beta/WorkPickStep.tsx` | 작품 인식 화면 |
| `app/components/beta/TranslateSettingsStep.tsx` | 번역 설정 화면 |
| `app/components/beta/CopyrightModal.tsx` | 저작권 동의 모달 |
| `app/components/beta/ExhaustedStep.tsx` | 번역권 소진 + 대비자 등록 |
| `app/mypage/page.tsx` | 내 번역 (번역권 2종 + 기록) |

### 수정하는 파일

| 경로 | 변경 |
|---|---|
| `app/globals.css` | 토큰 값을 프로토타입 팔레트로 교체, `[data-theme='pro']` 죽은 블록 삭제, `zslide`/`zbreathe`/`zblink` 키프레임 추가 |
| `app/config/constants.ts` | `APP_VERSION` 추가, `RESULT_RETENTION_DAYS` 추가 |
| `app/api/credits/route.ts` | 2잔액 반환 |
| `app/api/translation/begin/route.ts` | 모델을 받아 해당 잔액 차감, 402에 소진 종류 실음 |
| `app/lib/client/translationJob.ts` | `beginTranslationJob(totalBlocks, model)` |
| `app/hooks/useAuth.ts` | `balance: number` → `credits: { lite, pro }` |
| `app/hooks/useTranslation.ts` | `beginTranslationJob`에 모델 전달, 완료 후 결과물 업로드 |
| `app/page.tsx` | 상태 머신을 `useWizard`로 이관, 새 화면 배선, 결제 진입점 제거 |
| `app/components/simple/LandingPage.tsx` | 미니멀 베타 랜딩으로 전면 교체 |
| `app/components/simple/UploadStep.tsx` | 유형 탭 선행 + 잠긴 드롭존 |
| `app/components/simple/ProgressStep.tsx` | 4스테이지 체크리스트 |
| `app/components/simple/DoneStep.tsx` | 리포트 + 별점 피드백 |
| `app/i18n/simpleCopy.ts` | 신규 문구 전체 |
| `CLAUDE.md` | feature 워크트리 규칙 |
| `README.md` | 마이그레이션·Storage 설정 절차 |
| `docs/decisions.md` | 리디자인 결정 |
| `docs/TODO.md` | 결제 UI 재연결, 보관 만료 정리 |
| `package.json` | v0.19.0 |

### 삭제하는 파일

| 경로 | 근거 |
|---|---|
| `app/components/simple/StepTracker.tsx` | 프로토타입에 단계 표시기가 없다 |
| `app/components/simple/CreditWall.tsx` | `ExhaustedStep`으로 교체 |

`app/components/simple/PurchaseStep.tsx`와 `app/components/simple/LanguageSelect.tsx`는 **삭제하지 않는다** — 결제 오픈과 도착어 확장 때 다시 쓴다. 진입점만 제거하고 파일은 남긴다.

---

## Phase 0 — 준비

### Task 1: main 머지 + 작업 브랜치 생성

**Files:**
- Modify: `scripts/prompt-ab.mts` (미커밋 수정 1건 처리)

**Interfaces:**
- Consumes: 없음
- Produces: `redesign/beta` 브랜치. 이후 모든 태스크가 이 브랜치에서 커밋한다.

- [ ] **Step 1: 미커밋 수정 내용 확인**

```bash
git diff scripts/prompt-ab.mts
```

수정이 의미 있는 것이면 다음 스텝에서 커밋한다. 하네스 실험 중 남은 일회성 변경이면 `git checkout scripts/prompt-ab.mts`로 버린다. **판단이 안 서면 커밋하는 쪽을 택한다** — 하네스 스크립트는 프로덕션 경로가 아니라 버려도 되살릴 수 있지만, 대표가 튜닝하다 남긴 값일 수 있다.

- [ ] **Step 2: 수정분 커밋 (버리기로 했으면 스킵)**

```bash
git add scripts/prompt-ab.mts
git commit -m "$(cat <<'EOF'
하네스 스크립트의 미커밋 수정을 정리한다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: main으로 fast-forward 머지**

```bash
git checkout main
git merge --ff-only legal/terms-and-privacy
```

Expected: fast-forward 성공. `legal/terms-and-privacy`가 main을 완전히 포함하고 있으므로 충돌이 없어야 한다. `--ff-only`가 실패하면 그 가정이 깨진 것이므로 **멈추고 보고한다** (임의로 merge commit을 만들지 않는다).

- [ ] **Step 4: 작업 브랜치 생성**

```bash
git checkout -b redesign/beta
git log --oneline -1
```

- [ ] **Step 5: 기준선 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과. 통과하지 않으면 리디자인 전부터 깨져 있던 것이므로 먼저 고치거나 보고한다.

---

### Task 2: 디자인 토큰 교체 + APP_VERSION 상수화

**Files:**
- Modify: `app/globals.css:10-79` (`:root`, `[data-theme='pro']`, `@theme inline`)
- Modify: `app/config/constants.ts` (`APP_VERSION`, `RESULT_RETENTION_DAYS` 추가)
- Modify: `app/page.tsx:31-32` (로컬 `APP_VERSION` 제거, import로 교체)
- Modify: `package.json` (version 0.19.0)

**Interfaces:**
- Consumes: 없음
- Produces:
  - CSS 변수: `--bg` `--surface` `--surface-2` `--border` `--border-strong` `--ink` `--ink-2` `--ink-3` `--accent` `--accent-soft` `--accent-line` `--success` `--danger` `--radius` `--radius-lg` `--radius-sm` `--shadow` `--shadow-hover` `--nav-bg`
  - Tailwind 유틸: `bg-bg` `bg-surface` `text-ink` `text-ink-2` `text-ink-3` `bg-accent` `text-success` `text-danger` `rounded-card` `rounded-card-lg`
  - 키프레임: `zslide` `zbreathe` `zblink` + 유틸 클래스 `.animate-zslide` `.animate-zbreathe` `.animate-zblink`
  - `export const APP_VERSION = '0.19.0'` (from `app/config/constants.ts`)
  - `export const RESULT_RETENTION_DAYS = 30`

- [ ] **Step 1: 토큰 값 교체**

`app/globals.css`의 `:root` 블록(10-38행)을 아래로 교체한다. 기존 값은 녹색 계열 oklch였고, 프로토타입은 애플식 회색+옐로다. 프로토타입 원본이 hex라 hex를 그대로 쓴다 — oklch로 변환하면 눈으로 대조할 수 없어 시안 대조 비용이 커진다.

```css
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --surface-2: #fbfbfd;
  --border: rgba(0, 0, 0, 0.12);
  --border-strong: rgba(0, 0, 0, 0.25);
  --ink: #161614;
  --ink-body: #1d1d1f;
  --ink-2: #424245;
  --ink-3: #6e6e73;
  --ink-4: #86868b;
  --ink-5: #a1a1a6;
  --accent: #ffd84d;
  --accent-soft: rgba(255, 216, 77, 0.45);
  --accent-line: rgba(225, 178, 61, 0.55);
  --accent-wash: rgba(255, 216, 77, 0.14);
  --success: #34c759;
  --danger: #ff3b30;

  --radius: 16px;
  --radius-lg: 20px;
  --radius-sm: 12px;

  --shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-hover: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 30px rgba(0, 0, 0, 0.05);
  --shadow-modal: 0 24px 80px rgba(0, 0, 0, 0.25);

  --nav-bg: rgba(245, 245, 247, 0.72);

  --mono: var(--font-jetbrains-mono), ui-monospace, 'SFMono-Regular', monospace;
  --sans:
    'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont,
    system-ui, sans-serif;
}
```

- [ ] **Step 2: 죽은 Pro 테마 블록 삭제**

`app/globals.css`의 `[data-theme='pro']` 블록(41-56행) 전체를 삭제한다. Pro 워크스페이스 시안은 이연됐고 `data-theme="pro"`를 세팅하는 코드가 어디에도 없다. 확인:

```bash
grep -rn "data-theme" app/ proxy.ts
```

Expected: 삭제 후 매치 0건. 매치가 있으면 삭제하지 말고 보고한다.

- [ ] **Step 3: @theme inline 갱신**

`@theme inline` 블록을 아래로 교체한다.

```css
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-ink: var(--ink);
  --color-ink-body: var(--ink-body);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-ink-4: var(--ink-4);
  --color-ink-5: var(--ink-5);
  --color-accent: var(--accent);
  --color-accent-soft: var(--accent-soft);
  --color-accent-line: var(--accent-line);
  --color-accent-wash: var(--accent-wash);
  --color-success: var(--success);
  --color-danger: var(--danger);

  --font-sans: var(--sans);
  --font-mono: var(--mono);

  --radius-card: var(--radius);
  --radius-card-lg: var(--radius-lg);
  --radius-sm: var(--radius-sm);
}
```

- [ ] **Step 4: 키프레임 추가**

`app/globals.css` 끝에 추가한다. `prefers-reduced-motion` 무효화 규칙이 파일에 이미 있는지 확인하고(`grep -n "prefers-reduced-motion" app/globals.css`), 없으면 함께 넣는다.

```css
/* ── 프로토타입 모션 ── */
@keyframes zslide {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes zbreathe {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
@keyframes zblink {
  0%, 49%   { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.animate-zslide { animation: zslide 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.animate-zbreathe { animation: zbreathe 1.2s ease-in-out infinite; }
.animate-zblink { animation: zblink 1.06s step-end infinite; }

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: 상수 추가 테스트를 먼저 쓴다**

`app/config/constants.test.ts`에 추가:

```typescript
import { APP_VERSION, RESULT_RETENTION_DAYS } from './constants';

describe('APP_VERSION', () => {
  it('matches package.json so the footer never lies about the build', async () => {
    const pkg = await import('../../package.json');
    expect(APP_VERSION).toBe(pkg.default.version);
  });
});

describe('RESULT_RETENTION_DAYS', () => {
  it('is 30 — the retention promised on screen', () => {
    expect(RESULT_RETENTION_DAYS).toBe(30);
  });
});
```

기존 import 줄에 두 상수를 합쳐 넣어도 되고 별도 import 줄을 써도 된다.

- [ ] **Step 6: 테스트 실패 확인**

```bash
npx vitest run app/config/constants.test.ts
```

Expected: FAIL — `APP_VERSION`, `RESULT_RETENTION_DAYS`가 export되지 않았다는 타입/런타임 에러.

- [ ] **Step 7: 상수 추가**

`app/config/constants.ts` 상단(다른 상수보다 앞, 파일 헤더 주석 뒤)에 추가:

```typescript
/**
 * Build version, shown in the footer. Kept here rather than in page.tsx so the
 * one hardcoded copy sits next to every other constant — a test pins it to
 * package.json.
 */
export const APP_VERSION = '0.19.0';

/**
 * How long a finished translation stays downloadable. The beta ships without
 * automatic cleanup, so this is what the UI promises and what the history
 * screen enforces by disabling the button — not what a cron job deletes.
 */
export const RESULT_RETENTION_DAYS = 30;
```

`package.json`의 `version`을 `0.19.0`으로 바꾼다.

`tsconfig.json`에 `resolveJsonModule`이 켜져 있는지 확인한다(`grep resolveJsonModule tsconfig.json`). 없으면 `"resolveJsonModule": true`를 `compilerOptions`에 추가한다 — 없으면 테스트의 `import('../../package.json')`이 컴파일되지 않는다.

- [ ] **Step 8: 테스트 통과 확인**

```bash
npx vitest run app/config/constants.test.ts
```

Expected: PASS

- [ ] **Step 9: page.tsx의 로컬 상수 제거**

`app/page.tsx`의 31-32행

```typescript
// Keep in sync with package.json version.
const APP_VERSION = '0.15.0';
```

를 삭제하고, 26행의 import를 아래로 바꾼다.

```typescript
import { APP_VERSION, type AllowedModel } from './config/constants';
```

- [ ] **Step 10: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과. 토큰 이름이 바뀌었으므로 **기존 컴포넌트에서 `bg-accent-press` 같은 사라진 유틸을 쓰던 곳이 빌드 에러 대신 조용히 무효 클래스가 된다** (Tailwind는 모르는 클래스를 무시한다). 다음으로 확인한다:

```bash
grep -rn "accent-press\|border-strong\|text-ink-3" app/ --include=*.tsx | head -20
```

`accent-press`를 쓰는 곳은 `accent`로, 나머지는 남긴 토큰이므로 그대로 둔다. 이 화면들은 Phase 3에서 전부 다시 쓰므로 지금은 컴파일만 통과시키고 시각 정리는 하지 않는다.

- [ ] **Step 11: Browser로 랜딩 확인**

`preview_start`로 dev 서버를 띄우고 `/`를 본다. 아직 랜딩은 구 디자인이지만 **배경이 `#f5f5f7`로, 강조가 옐로로 바뀌었는지**만 확인한다. 콘솔 에러가 없어야 한다.

- [ ] **Step 12: 커밋**

```bash
git add app/globals.css app/config/constants.ts app/config/constants.test.ts app/page.tsx package.json tsconfig.json
git commit -m "$(cat <<'EOF'
디자인 토큰을 프로토타입 팔레트로 교체하고 APP_VERSION을 상수로 옮긴다.

녹색 계열 oklch 토큰을 애플식 회색+옐로 hex로 바꾼다. 시안이 hex라 hex로
두는 게 대조 비용이 낮다. 쓰이지 않는 [data-theme='pro'] 블록을 지우고,
프로토타입의 zslide/zbreathe/zblink 키프레임을 넣는다.

APP_VERSION이 package.json(0.18.0)과 어긋나 있었다(0.15.0). 상수 파일로
옮기고 테스트로 두 값을 묶는다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — 백엔드

### Task 3: 번역권 라이트/프로 분리

**Files:**
- Create: `supabase/migrations/0004_credit_tiers.sql`
- Modify: `app/api/credits/route.ts`
- Modify: `app/api/translation/begin/route.ts`
- Modify: `app/lib/client/translationJob.ts`
- Modify: `app/hooks/useAuth.ts`
- Modify: `app/hooks/useTranslation.ts` (`beginTranslationJob` 호출부만)
- Create: `app/lib/creditKind.ts`
- Create: `app/lib/creditKind.test.ts`

**Interfaces:**
- Consumes: `FLASH_MODEL` / `PRO_MODEL` / `AllowedModel` (from `app/config/constants.ts`)
- Produces:
  - `export type CreditKind = 'lite' | 'pro'`
  - `export function creditKindForModel(model: string): CreditKind`
  - `export interface CreditBalances { lite: number; pro: number }`
  - `GET /api/credits` → `{ credits: { lite: number, pro: number }, email: string | null }`
  - `POST /api/translation/begin` body `{ totalBlocks: number, model: string }` → `{ jobId: string }`, 402 시 `{ error: 'insufficient_credits', kind: CreditKind }`
  - `beginTranslationJob(totalBlocks: number, model: AllowedModel): Promise<string>`
  - `JobRefusedError`에 `kind?: CreditKind` 필드 추가
  - `useAuth()` 반환에 `credits: CreditBalances | null` (기존 `balance` 제거)
  - SQL: `begin_translation_job(p_total_blocks integer, p_model text) returns uuid`, `grant_credits(..., p_kind text)`

- [ ] **Step 1: creditKind 테스트를 먼저 쓴다**

Create `app/lib/creditKind.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FLASH_MODEL, PRO_MODEL } from '../config/constants';
import { creditKindForModel } from './creditKind';

describe('creditKindForModel', () => {
  it('charges the pro balance for the pro model', () => {
    expect(creditKindForModel(PRO_MODEL)).toBe('pro');
  });

  it('charges the lite balance for the flash model', () => {
    expect(creditKindForModel(FLASH_MODEL)).toBe('lite');
  });

  it('falls back to lite for an unknown model', () => {
    // A model id we do not recognise must never bill the scarcer balance.
    expect(creditKindForModel('gemini-9-imaginary')).toBe('lite');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run app/lib/creditKind.test.ts
```

Expected: FAIL — `./creditKind` 모듈이 없다.

- [ ] **Step 3: creditKind 구현**

Create `app/lib/creditKind.ts`:

```typescript
import { PRO_MODEL } from '../config/constants';

/**
 * Which balance a translation spends.
 *
 * Split because the two models' costs are not comparable — pro runs at HIGH
 * thinking, which is billed at the output rate — so one shared balance would
 * let a beta user drain the expensive path with cheap-path credits.
 */
export type CreditKind = 'lite' | 'pro';

export interface CreditBalances {
  lite: number;
  pro: number;
}

/**
 * Unknown ids resolve to 'lite' deliberately: mis-billing the cheap balance
 * costs us a rounding error, mis-billing the scarce one costs a user their
 * pro translation.
 */
export function creditKindForModel(model: string): CreditKind {
  return model === PRO_MODEL ? 'pro' : 'lite';
}
```

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run app/lib/creditKind.test.ts
```

Expected: PASS

- [ ] **Step 5: 마이그레이션 작성**

Create `supabase/migrations/0004_credit_tiers.sql`:

```sql
-- ZAMAK: 번역권을 라이트/프로 2종으로 분리
--
-- Run this once in the Supabase SQL editor, after 0003_beta_signup_credit.sql.
--
-- Why two balances: pro runs at HIGH thinking and is billed at the output
-- rate, so it costs several times what lite does. One shared balance would let
-- a beta user spend cheap-path credits on the expensive path.
--
-- Migration safety: existing balances move to lite_balance. Nobody loses a
-- credit, and nobody is handed a pro credit they did not have.

-- ------------------------------------------------------ credits: 2 balances ---

alter table public.credits
  add column if not exists lite_balance integer not null default 0
    check (lite_balance >= 0),
  add column if not exists pro_balance integer not null default 0
    check (pro_balance >= 0);

-- Carry the old single balance over exactly once. The `balance` column is kept
-- (not dropped) so a rollback does not lose data; nothing reads it after this.
update public.credits
   set lite_balance = balance
 where lite_balance = 0
   and balance > 0;

comment on column public.credits.balance is
  'DEPRECATED — superseded by lite_balance/pro_balance in 0004. Kept for rollback.';

-- ------------------------------------------------- signup grant (라이트3 프로1) ---

create or replace function public.grant_signup_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits (user_id, balance, lite_balance, pro_balance)
  values (new.id, 0, 3, 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- The trigger itself is unchanged (0001 created it); replacing the function is
-- enough. Re-declared here so this file is self-contained if run on a fresh DB.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.grant_signup_credit();

-- ------------------------------------------- spend one credit (모델별 잔액) ---

-- Replaces the single-argument version from 0001. The old signature is dropped
-- so a stale client cannot silently spend from the wrong balance.
drop function if exists public.begin_translation_job(integer);

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
  v_user_id uuid := auth.uid();
  v_job_id  uuid;
  v_kind    text;
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

  insert into public.translation_jobs (user_id, total_blocks, model)
  values (v_user_id, p_total_blocks, p_model)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.begin_translation_job(integer, text) from public;
grant execute on function public.begin_translation_job(integer, text) to authenticated;

-- ------------------------------------------------- purchases grant by kind ---

-- 0002_payments.sql granted to the single balance. Payment UI is out of the
-- beta, but leaving this pointing at a dead column would surface as a broken
-- grant the day payments open.
drop function if exists public.grant_credits(text, uuid, integer, integer);

create or replace function public.grant_credits(
  p_order_id text,
  p_payment_key text,
  p_credits integer,
  p_amount integer,
  p_kind text default 'lite'
)
returns void
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

  -- Idempotent: a retried confirmation must not grant twice.
  insert into public.purchases (order_id, payment_key, user_id, credits, amount)
  values (p_order_id, p_payment_key, v_user_id, p_credits, p_amount)
  on conflict (order_id) do nothing;

  if not found then
    return;
  end if;

  if p_kind = 'pro' then
    update public.credits
       set pro_balance = pro_balance + p_credits, updated_at = now()
     where user_id = v_user_id;
  else
    update public.credits
       set lite_balance = lite_balance + p_credits, updated_at = now()
     where user_id = v_user_id;
  end if;
end;
$$;

revoke all on function public.grant_credits(text, text, integer, integer, text) from public;
grant execute on function public.grant_credits(text, text, integer, integer, text) to authenticated;
```

**주의:** 위 `grant_credits` 재정의는 `0002_payments.sql`의 실제 시그니처·본문과 맞아야 한다. 작업 전에 `0002_payments.sql`을 읽고 파라미터 순서·타입·`purchases` 컬럼명을 대조해 그대로 옮긴다. 다르면 실제 파일을 따른다 — 위 코드는 0002의 구조를 가정한 것이다.

`translation_jobs.model` 컬럼은 Task 6에서 추가하지만 이 함수가 먼저 참조한다. **이 마이그레이션에 컬럼 추가를 함께 넣는다** (아래 스텝).

- [ ] **Step 6: translation_jobs.model 컬럼을 0004에 추가**

`0004_credit_tiers.sql`의 `begin_translation_job` 정의 **앞**에 넣는다:

```sql
-- ------------------------------------------------------ jobs: model column ---

-- begin_translation_job records which model a job used; the history screen
-- shows it, and it is the only record of what a credit was spent on.
alter table public.translation_jobs
  add column if not exists model text;
```

- [ ] **Step 7: credits 라우트를 2잔액으로**

`app/api/credits/route.ts` 전체를 교체:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Current user's credit balances, for the nav chip and the settings cards. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits')
    .select('lite_balance, pro_balance')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    // No row yet means the signup trigger has not fired; treat as zero rather
    // than erroring, so the UI shows the exhausted screen instead of breaking.
    credits: {
      lite: data?.lite_balance ?? 0,
      pro: data?.pro_balance ?? 0,
    },
    email: auth.user.email ?? null,
  });
}
```

- [ ] **Step 8: begin 라우트가 모델을 받도록**

`app/api/translation/begin/route.ts`에서 body 파싱과 rpc 호출부를 바꾼다. 18-31행의 body 처리를 아래로 교체:

```typescript
  let body: { totalBlocks?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const totalBlocks = Number(body.totalBlocks);
  if (!Number.isInteger(totalBlocks) || totalBlocks <= 0) {
    return NextResponse.json(
      { error: 'A positive totalBlocks is required' },
      { status: 400 },
    );
  }

  // The model decides which balance is spent, so an unrecognised id must be
  // refused here rather than silently defaulting — a typo would otherwise
  // charge the lite balance for a pro run.
  const model = String(body.model ?? '');
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    return NextResponse.json(
      { error: 'A known model is required' },
      { status: 400 },
    );
  }
```

44-56행의 rpc 호출·에러 처리를 아래로 교체:

```typescript
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('begin_translation_job', {
    p_total_blocks: totalBlocks,
    p_model: model,
  });

  if (error) {
    // The function raises this when that balance is already zero. It is an
    // expected outcome, not a fault, so it gets its own status and code — and
    // carries which balance ran out, so the screen names the right one.
    if (error.message.includes('insufficient credits')) {
      return NextResponse.json(
        {
          error: 'insufficient_credits',
          kind: error.message.includes('pro') ? 'pro' : 'lite',
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
```

import 줄에 `ALLOWED_MODELS`를 추가한다:

```typescript
import { ALLOWED_MODELS, MAX_BLOCKS_PER_CREDIT } from '../../../config/constants';
```

- [ ] **Step 9: 클라이언트 헬퍼에 모델 전달**

`app/lib/client/translationJob.ts`를 읽고 다음을 바꾼다.

- `beginTranslationJob(totalBlocks: number)` → `beginTranslationJob(totalBlocks: number, model: AllowedModel)`
- fetch body: `JSON.stringify({ totalBlocks, model })`
- 응답 파싱 타입에 `kind?: 'lite' | 'pro'` 추가
- `JobRefusedError` 생성 시 `kind`를 넘긴다

`JobRefusedError` 클래스에 필드를 추가한다 (현재 정의는 같은 파일에 있다):

```typescript
export class JobRefusedError extends Error {
  readonly code: string;
  readonly maxBlocks?: number;
  /** Which balance ran out. Set only for `insufficient_credits`. */
  readonly kind?: CreditKind;

  constructor(code: string, message: string, maxBlocks?: number, kind?: CreditKind) {
    super(message);
    this.name = 'JobRefusedError';
    this.code = code;
    this.maxBlocks = maxBlocks;
    this.kind = kind;
  }
}
```

기존 클래스가 파라미터 프로퍼티 문법이나 다른 형태로 되어 있으면 **그 형태를 유지하면서 `kind`만 추가한다** — 커밋 947a188이 하네스 로딩 때문에 파라미터 프로퍼티를 일부러 제거한 이력이 있으니 문법을 되돌리지 않는다.

파일 상단에 `import type { CreditKind } from '../creditKind';`를 추가한다 (`app/lib/client/translationJob.ts` → `app/lib/creditKind.ts`이므로 한 단계 위다).

- [ ] **Step 10: useTranslation의 호출부 갱신**

`app/hooks/useTranslation.ts:267`

```typescript
const jobId = await beginTranslationJob(blocks.length);
```

를 아래로 바꾼다. 이 함수 스코프에 이미 `model` 값이 있는지 확인하고(`translate`의 인자), 없으면 인자에서 끌어온다.

```typescript
const jobId = await beginTranslationJob(blocks.length, model);
```

- [ ] **Step 11: useAuth를 2잔액으로 + 이메일 노출**

`app/hooks/useAuth.ts`에서:

- `AccountState.balance: number | null` → `credits: CreditBalances | null`
- `AccountState`에 `email: string | null` 추가. `/api/credits`가 이미 `email`을 반환하고 있고, 소진 화면(Task 15)이 대기자 입력란의 기본값으로 쓴다 — 아는 값을 다시 묻지 않기 위해 여기서 함께 뚫어둔다
- `refreshBalance`의 파싱을 `{ credits?: CreditBalances; email?: string | null }`로 바꾸고 `credits: data.credits ?? { lite: 0, pro: 0 }`, `email: data.email ?? null`로 세팅
- 함수명은 `refreshBalance` 그대로 둔다 (호출부가 여러 곳이고 의미가 변하지 않는다)
- `setState({ user: ..., balance: null, ... })` 3곳을 `credits: null, email: null`로

`import type { CreditBalances } from '../lib/creditKind';`를 추가한다.

- [ ] **Step 12: page.tsx의 balance 사용부 임시 대응**

`app/page.tsx`가 `balance`를 3곳에서 쓴다(구조분해, 헤더 칩 조건, `PurchaseStep` prop). Phase 3에서 전부 다시 쓰므로 **지금은 컴파일만 통과시킨다**:

- 구조분해를 `credits`로
- 헤더 칩 조건을 `user && credits &&`로, 라벨을 `COPY.auth.creditsLeft(credits.lite)`로 (문구는 Task 18에서 제대로 바꾼다)
- `PurchaseStep balance={credits?.lite ?? null}`

- [ ] **Step 13: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과.

- [ ] **Step 14: 마이그레이션을 실제 DB에 적용하고 라우트를 검증**

대표가 Supabase SQL 에디터에서 `0004_credit_tiers.sql`을 실행해야 한다. 실행 전에는 아래 검증을 할 수 없다 — **실행을 요청하고 기다린다**. 실행 후:

```bash
curl -s -i http://localhost:3000/api/credits | head -5
```

Expected: 401 (익명). 게이트가 살아 있다는 확인. 로그인 상태의 200 응답 확인은 대표 몫이다.

- [ ] **Step 15: 커밋**

```bash
git add supabase/migrations/0004_credit_tiers.sql app/lib/creditKind.ts app/lib/creditKind.test.ts app/api/credits/route.ts app/api/translation/begin/route.ts app/lib/client/translationJob.ts app/hooks/useAuth.ts app/hooks/useTranslation.ts app/page.tsx
git commit -m "$(cat <<'EOF'
번역권을 라이트/프로 2종으로 분리한다.

프로는 HIGH thinking으로 돌아 출력 단가로 과금되니 라이트와 원가가 비교가
안 된다. 잔액이 하나면 싼 경로 크레딧으로 비싼 경로를 비울 수 있다.

모델→잔액 매핑을 SQL 함수 안에도 둬서 클라이언트가 어느 잔액을 깎을지
고르지 못하게 한다. 402 응답에 소진된 종류를 실어 소진 화면이 이름을 맞게
낸다. 모르는 모델 id는 400으로 거절한다 — 조용히 라이트로 떨어지면 오타가
프로 실행을 라이트로 과금한다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 피드백 수집

**Files:**
- Create: `supabase/migrations/0005_feedback.sql`
- Create: `app/api/feedback/route.ts`
- Create: `app/lib/client/feedback.ts`

**Interfaces:**
- Consumes: `requireUser` (from `app/lib/server/auth.ts`)
- Produces:
  - `POST /api/feedback` body `{ jobId: string, rating: number, comment?: string }` → `{ ok: true }`
  - `export async function sendFeedback(jobId: string, rating: number, comment: string): Promise<boolean>` — 실패 시 throw하지 않고 `false`. 피드백 실패가 완료 화면을 깨서는 안 된다.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0005_feedback.sql`:

```sql
-- ZAMAK: 번역 품질 피드백 (별점 + 자유 의견)
--
-- Run this once in the Supabase SQL editor.
--
-- This is the beta's only quantitative quality signal, so it is the one table
-- whose absence would make the beta pointless. Kept deliberately small.

create table if not exists public.feedback (
  job_id     uuid primary key references public.translation_jobs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     integer not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- One row per job (job_id is the PK), so re-rating overwrites rather than
-- piling up duplicates.
drop policy if exists "feedback is readable by its owner" on public.feedback;
create policy "feedback is readable by its owner"
  on public.feedback for select
  using (auth.uid() = user_id);

drop policy if exists "feedback is insertable by its owner" on public.feedback;
create policy "feedback is insertable by its owner"
  on public.feedback for insert
  with check (
    auth.uid() = user_id
    -- Only for a job the caller actually owns; otherwise a user could rate
    -- someone else's translation.
    and exists (
      select 1 from public.translation_jobs j
       where j.id = job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "feedback is updatable by its owner" on public.feedback;
create policy "feedback is updatable by its owner"
  on public.feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: 라우트 작성**

Create `app/api/feedback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Max stored comment length. Longer input is truncated, not rejected — a
 *  rejected rating is a lost signal, and the signal is the point. */
const MAX_COMMENT = 2000;

/**
 * Records a rating for one finished translation.
 *
 * Upsert on job_id so re-rating replaces the previous answer instead of
 * stacking rows. RLS additionally checks the job belongs to the caller.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { jobId?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '');
  const rating = Number(body.rating);
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: 'rating must be an integer from 1 to 5' },
      { status: 400 },
    );
  }

  const comment =
    typeof body.comment === 'string' ? body.comment.slice(0, MAX_COMMENT) : null;

  const supabase = await createClient();
  const { error } = await supabase.from('feedback').upsert(
    {
      job_id: jobId,
      user_id: auth.user.id,
      rating,
      comment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'job_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 클라이언트 헬퍼 작성**

Create `app/lib/client/feedback.ts`:

```typescript
/**
 * Sends a rating for a finished translation.
 *
 * Returns false instead of throwing: a failed rating must never take down the
 * completion screen the user is standing on, and there is nothing they could
 * do about it anyway.
 */
export async function sendFeedback(
  jobId: string,
  rating: number,
  comment: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, rating, comment: comment || undefined }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/feedback \
  -H 'Content-Type: application/json' -d '{"jobId":"x","rating":5}'
```

Expected: `401` — 익명 차단. 이 라우트는 돈을 쓰지 않지만 남의 job에 별점을 달 수 없어야 한다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0005_feedback.sql app/api/feedback/route.ts app/lib/client/feedback.ts
git commit -m "$(cat <<'EOF'
번역 품질 피드백(별점·의견)을 수집한다.

베타의 존재 이유인 "품질이 돈 받을 수준인가"를 재는 유일한 정량 신호다.
job_id를 PK로 둬서 재평가가 쌓이지 않고 덮어쓰이고, RLS가 남의 job에는
별점을 못 달게 막는다. 클라이언트 헬퍼는 실패해도 throw하지 않는다 —
피드백 실패가 완료 화면을 깨면 안 된다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 결제 오픈 대기자 등록

**Files:**
- Create: `supabase/migrations/0006_waitlist.sql`
- Create: `app/api/waitlist/route.ts`
- Create: `app/lib/client/waitlist.ts`

**Interfaces:**
- Consumes: `requireUser`
- Produces:
  - `POST /api/waitlist` body `{ email: string }` → `{ ok: true }`
  - `export async function joinWaitlist(email: string): Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0006_waitlist.sql`:

```sql
-- ZAMAK: 결제 오픈 대기자
--
-- Run this once in the Supabase SQL editor.
--
-- The exhausted screen offers this instead of a payment window during the
-- beta. The signup rate is the leading indicator for payment conversion, which
-- is the second thing the beta exists to measure.
--
-- user_id is the PK: this is offered only to signed-in users who ran out of
-- credits, so one row per account is exactly right and duplicate submissions
-- are impossible by construction.

create table if not exists public.waitlist (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist is readable by its owner" on public.waitlist;
create policy "waitlist is readable by its owner"
  on public.waitlist for select
  using (auth.uid() = user_id);

drop policy if exists "waitlist is insertable by its owner" on public.waitlist;
create policy "waitlist is insertable by its owner"
  on public.waitlist for insert
  with check (auth.uid() = user_id);

drop policy if exists "waitlist is updatable by its owner" on public.waitlist;
create policy "waitlist is updatable by its owner"
  on public.waitlist for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 2: 라우트 작성**

Create `app/api/waitlist/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Deliberately loose: we are collecting an address to mail later, not
 *  authenticating with it. Rejecting a typo'd address the user can see and
 *  retype is fine; rejecting a valid unusual one is not. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Records interest in paid credits, for the beta's exhausted screen. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('waitlist')
    .upsert({ user_id: auth.user.id, email }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 클라이언트 헬퍼 작성**

Create `app/lib/client/waitlist.ts`:

```typescript
/**
 * Joins the payment-launch waitlist.
 *
 * Unlike feedback this reports failure, because the user is waiting on a
 * confirmation and an address we never stored is a promise we cannot keep.
 */
export async function joinWaitlist(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? 'unknown' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
```

- [ ] **Step 4: 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/waitlist \
  -H 'Content-Type: application/json' -d '{"email":"a@b.co"}'
```

Expected: 검증 통과 + `401`.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0006_waitlist.sql app/api/waitlist/route.ts app/lib/client/waitlist.ts
git commit -m "$(cat <<'EOF'
결제 오픈 대기자 등록을 받는다.

소진 화면이 베타 기간에 결제창 대신 이걸 보여준다. 번역권을 다 쓴 사람이
이메일을 남기는 비율이 결제 전환율의 선행 지표고, 그게 베타가 재려는 두 번째
값이다. user_id를 PK로 둬서 중복 등록이 구조적으로 불가능하다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 결과물 보관 + 번역 기록

**Files:**
- Create: `supabase/migrations/0007_job_results.sql`
- Create: `app/api/translation/result/route.ts`
- Create: `app/api/translation/history/route.ts`
- Create: `app/lib/jobHistory.ts` — **공용** 타입 + 만료 판정 (서버 라우트와 클라이언트가 함께 쓴다)
- Create: `app/lib/jobHistory.test.ts`
- Create: `app/lib/client/history.ts` — fetch 헬퍼만 (클라이언트 전용)
- Modify: `app/hooks/useTranslation.ts` (완료 후 업로드 + `jobId` 노출)

**레이어 주의:** `isExpired`와 타입들은 `app/lib/jobHistory.ts`(공용)에 둔다. 만료 판정은 서버 라우트가 signed URL을 발급할지 결정할 때도 쓰고 화면이 버튼을 잠글 때도 쓰므로 한쪽에만 두면 로직이 갈라진다. `app/lib/`의 루트는 이 리포의 공용 레이어다(`srt.ts`, `translationErrors.ts`, `brand.ts`가 같은 자리). **서버 라우트가 `app/lib/client/`에서 import하게 만들지 않는다.**

**Interfaces:**
- Consumes: `requireUser`, `RESULT_RETENTION_DAYS` (from `app/config/constants.ts`)
- Produces:
  - `POST /api/translation/result` body `{ jobId: string, filename: string, content: string, options: JobOptions }` → `{ ok: true }`
  - `GET /api/translation/history` → `{ items: HistoryItem[] }`
  - from `app/lib/jobHistory.ts` (공용): `export interface JobOptions { glossary: boolean }`
  - from `app/lib/jobHistory.ts`: `export interface HistoryItem { jobId: string; filename: string; model: string | null; totalBlocks: number; createdAt: string; options: JobOptions | null; expired: boolean; downloadUrl: string | null }`
  - from `app/lib/jobHistory.ts`: `export function isExpired(createdAt: string, now: Date, retentionDays?: number): boolean`
  - from `app/lib/client/history.ts`: `export async function saveResult(jobId, filename, content, options): Promise<boolean>`
  - from `app/lib/client/history.ts`: `export async function fetchHistory(): Promise<HistoryItem[]>`
  - `useTranslation()` 반환에 `jobId: string | null` 추가

- [ ] **Step 1: 만료 판정 테스트를 먼저 쓴다**

Create `app/lib/jobHistory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isExpired } from './jobHistory';

describe('isExpired', () => {
  const created = '2026-07-01T00:00:00.000Z';

  it('keeps a result inside the retention window', () => {
    expect(isExpired(created, new Date('2026-07-20T00:00:00.000Z'), 30)).toBe(false);
  });

  it('expires a result past the retention window', () => {
    expect(isExpired(created, new Date('2026-08-05T00:00:00.000Z'), 30)).toBe(true);
  });

  it('treats the exact boundary as still available', () => {
    // A user who comes back on day 30 was promised 30 days, so the last day
    // counts as inside.
    expect(isExpired(created, new Date('2026-07-31T00:00:00.000Z'), 30)).toBe(false);
  });

  it('treats an unparseable timestamp as expired', () => {
    // Failing closed here shows "보관 기간이 지났어요" instead of handing out a
    // link that 404s.
    expect(isExpired('not-a-date', new Date('2026-07-02T00:00:00.000Z'), 30)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run app/lib/jobHistory.test.ts
```

Expected: FAIL — `./jobHistory` 모듈이 없다.

- [ ] **Step 3: 공용 모듈 + 클라이언트 헬퍼 구현**

먼저 공용 모듈. Create `app/lib/jobHistory.ts`:

```typescript
import { RESULT_RETENTION_DAYS } from '../config/constants';

/** What was switched on for a run. Recorded so the history line can say
 *  "· 용어집" — the one option that changes both the price in time and the
 *  result, and the only one worth remembering per job. */
export interface JobOptions {
  glossary: boolean;
}

/** One past translation, as the history screen renders it. */
export interface HistoryItem {
  jobId: string;
  /** Original uploaded filename. The download is this with `.ko.srt`. */
  filename: string;
  model: string | null;
  totalBlocks: number;
  createdAt: string;
  options: JobOptions | null;
  /** Past the retention window we promised. The button is disabled, whether or
   *  not the bytes are still in the bucket. */
  expired: boolean;
  /** Short-lived signed URL, null when expired or never stored. */
  downloadUrl: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a result is past the retention we promised on screen.
 *
 * The beta ships without automatic cleanup, so this — not a cron job — is what
 * makes the 30-day promise true. An unparseable date counts as expired: better
 * to say the window closed than to offer a link that fails.
 */
export function isExpired(
  createdAt: string,
  now: Date,
  retentionDays: number = RESULT_RETENTION_DAYS,
): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > retentionDays * DAY_MS;
}

```

그리고 클라이언트 전용 fetch 헬퍼. Create `app/lib/client/history.ts`:

```typescript
import type { HistoryItem, JobOptions } from '../jobHistory';

/**
 * Stores the finished translation so it can be downloaded again later.
 *
 * Returns false rather than throwing: the user already has the file in the
 * browser, so a failed upload costs them the re-download, not the translation.
 */
export async function saveResult(
  jobId: string,
  filename: string,
  content: string,
  options: JobOptions,
): Promise<boolean> {
  try {
    const res = await fetch('/api/translation/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, filename, content, options }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const res = await fetch('/api/translation/history');
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { items?: HistoryItem[] } | null;
  return body?.items ?? [];
}
```

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run app/lib/jobHistory.test.ts
```

Expected: PASS (4개)

- [ ] **Step 5: 마이그레이션 작성**

Create `supabase/migrations/0007_job_results.sql`:

```sql
-- ZAMAK: 번역 결과물 보관
--
-- Run this once in the Supabase SQL editor. Then create a PRIVATE Storage
-- bucket named `results` in the Supabase dashboard (Storage → New bucket,
-- "Public bucket" OFF) — the policies below assume it exists.
--
-- We store the RESULT ONLY, never the uploaded source. Two reasons: the source
-- is the user's copyrighted material and we have no standing reason to hold it,
-- and the result is the thing a credit paid for.
--
-- Retention is 30 days, enforced in the UI (the beta ships without a cleanup
-- job — see docs/TODO.md). Objects therefore outlive their download button.

alter table public.translation_jobs
  add column if not exists source_filename text,
  add column if not exists result_path     text,
  add column if not exists options         jsonb,
  add column if not exists completed_at    timestamptz;

-- `model` is added in 0004 (begin_translation_job writes it).

-- ---------------------------------------------------------- storage policies ---

-- Objects are keyed <user_id>/<job_id>.ko.srt, so the first path segment is the
-- owner and one policy covers every object without a per-row join.
drop policy if exists "results are readable by their owner" on storage.objects;
create policy "results are readable by their owner"
  on storage.objects for select
  using (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "results are insertable by their owner" on storage.objects;
create policy "results are insertable by their owner"
  on storage.objects for insert
  with check (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "results are updatable by their owner" on storage.objects;
create policy "results are updatable by their owner"
  on storage.objects for update
  using (
    bucket_id = 'results'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------- record a finished result ---

-- security definer so the row can be written without opening translation_jobs
-- to client writes; every statement is still scoped to auth.uid().
create or replace function public.record_job_result(
  p_job_id uuid,
  p_filename text,
  p_result_path text,
  p_options jsonb
)
returns void
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

  update public.translation_jobs
     set source_filename = p_filename,
         result_path     = p_result_path,
         options         = p_options,
         completed_at    = now()
   where id = p_job_id
     and user_id = v_user_id;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.record_job_result(uuid, text, text, jsonb) from public;
grant execute on function public.record_job_result(uuid, text, text, jsonb) to authenticated;
```

- [ ] **Step 6: 결과물 저장 라우트 작성**

Create `app/api/translation/result/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';

/** A 2,000-block subtitle file is well under this; the cap only stops a
 *  pathological body from becoming a storage bill. */
const MAX_BYTES = 4 * 1024 * 1024;

export const maxDuration = 60;

/**
 * Stores a finished translation so the history screen can offer it again.
 *
 * The result only — the uploaded source is never stored. Ownership is checked
 * twice: the storage path is derived from the session (not the request), and
 * record_job_result scopes its update to auth.uid().
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: {
    jobId?: unknown;
    filename?: unknown;
    content?: unknown;
    options?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '');
  const filename = String(body.filename ?? '');
  const content = typeof body.content === 'string' ? body.content : '';
  // Normalised rather than passed through: this lands in a jsonb column, and
  // whatever a client sends should not decide that column's shape.
  const options = {
    glossary:
      typeof body.options === 'object' &&
      body.options !== null &&
      (body.options as { glossary?: unknown }).glossary === true,
  };

  if (!jobId || !filename || !content) {
    return NextResponse.json(
      { error: 'jobId, filename and content are required' },
      { status: 400 },
    );
  }
  if (content.length > MAX_BYTES) {
    return NextResponse.json({ error: 'result_too_large' }, { status: 413 });
  }

  const supabase = await createClient();
  // Path is built from the session, never from the request: this is what makes
  // the storage policy's folder check a real ownership boundary.
  const path = `${auth.user.id}/${jobId}.ko.srt`;

  const { error: uploadError } = await supabase.storage
    .from('results')
    .upload(path, new Blob([content], { type: 'text/plain;charset=utf-8' }), {
      upsert: true,
      contentType: 'text/plain;charset=utf-8',
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error } = await supabase.rpc('record_job_result', {
    p_job_id: jobId,
    p_filename: filename,
    p_result_path: path,
    p_options: options,
  });

  if (error) {
    if (error.message.includes('job not found')) {
      return NextResponse.json({ error: 'job_not_found' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: 기록 조회 라우트 작성**

Create `app/api/translation/history/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { isExpired, type JobOptions } from '../../../lib/jobHistory';

/** Signed URLs are minted per request and expire quickly — the link is for the
 *  click that follows, not something to keep. */
const SIGNED_URL_TTL_SECONDS = 300;

/** Enough to fill the beta's history screen without paging. */
const LIMIT = 50;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('translation_jobs')
    .select(
      'id, source_filename, model, total_blocks, created_at, result_path, options',
    )
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const expired = isExpired(row.created_at, now);
      let downloadUrl: string | null = null;

      // Past the promised window we do not hand out a link even if the object
      // is still there — the beta has no cleanup job, so objects outlive the
      // promise and the UI is what keeps it.
      if (!expired && row.result_path) {
        const { data: signed } = await supabase.storage
          .from('results')
          .createSignedUrl(row.result_path, SIGNED_URL_TTL_SECONDS);
        downloadUrl = signed?.signedUrl ?? null;
      }

      return {
        jobId: row.id as string,
        filename: (row.source_filename as string | null) ?? '',
        model: (row.model as string | null) ?? null,
        totalBlocks: (row.total_blocks as number) ?? 0,
        createdAt: row.created_at as string,
        options: (row.options as JobOptions | null) ?? null,
        expired,
        downloadUrl,
      };
    }),
  );

  // A job with no stored result never finished (or predates storage) — it has
  // nothing to offer, so it does not belong on a "다시 받기" list.
  return NextResponse.json({ items: items.filter((i) => i.filename) });
}
```

- [ ] **Step 8: useTranslation이 jobId를 노출하고 완료 시 업로드**

`app/hooks/useTranslation.ts`에서:

1. `const [jobId, setJobId] = useState<string | null>(null);`를 다른 state 옆(183행 근처)에 추가
2. 267행 `const jobId = await beginTranslationJob(...)`를 지역 변수로 유지하되 바로 뒤에 `setJobId(jobId);` 추가
3. 결과를 `setResult(...)`로 확정하는 지점(503행 근처, `failedChunks`가 들어가는 객체 생성부) **뒤에** 업로드를 건다. 사용자를 기다리게 하지 않으므로 await하지 않는다:

```typescript
      // Fire-and-forget: the user already has the file, and a failed upload
      // costs them the re-download, not the translation. Errors are swallowed
      // inside saveResult.
      void saveResult(jobId, file.name, finalContent, {
        glossary: Boolean(castSheet),
      });
```

`finalContent`와 `file.name`은 그 스코프의 실제 변수명으로 바꾼다 — 번역 결과 SRT 문자열과 원본 파일명이다. 스코프에 원본 파일명이 없으면 `processFile`에서 받은 `File`을 ref에 담아 쓴다. `castSheet`는 `translate()`가 받은 인자다 — 시트가 실제로 넘어왔을 때만 `glossary: true`가 되어야 하고, 토글이 켜졌지만 추출이 실패해 `undefined`가 넘어온 경우는 false다 (기록은 **적용된 것**을 남기는 것이지 켠 것을 남기는 게 아니다).

4. 반환 객체에 `jobId`를 추가한다
5. `clearFile`에서 `setJobId(null)`

`import { saveResult } from '../lib/client/history';`를 추가한다.

- [ ] **Step 9: 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/translation/history
```

Expected: 검증 통과 + `401`.

- [ ] **Step 10: 대표 액션 요청**

Supabase 대시보드에서 **비공개** Storage 버킷 `results` 생성 + `0007_job_results.sql` 실행을 요청한다. 버킷이 없으면 업로드가 실패하고(그리고 `saveResult`가 조용히 false를 반환해) 기록이 비어 보인다.

- [ ] **Step 11: 커밋**

```bash
git add supabase/migrations/0007_job_results.sql app/api/translation/result/route.ts app/api/translation/history/route.ts app/lib/jobHistory.ts app/lib/jobHistory.test.ts app/lib/client/history.ts app/hooks/useTranslation.ts
git commit -m "$(cat <<'EOF'
번역 결과물을 보관하고 기록에서 다시 받게 한다.

결과물만 저장하고 업로드한 원본은 저장하지 않는다 — 원본은 사용자의 저작물이고
우리가 들고 있을 근거가 없다. 저장 경로를 세션에서 만들어(요청이 아니라) Storage
정책의 폴더 검사가 실제 소유권 경계가 되게 한다.

보관 30일은 정리 cron 없이 UI가 지킨다. 만료된 항목은 객체가 남아 있어도 링크를
주지 않는다 — 지운 뒤 404가 나는 것보다 "기간이 지났다"고 말하는 게 낫다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 저작권 동의 기록

**Files:**
- Create: `supabase/migrations/0008_copyright_consents.sql`
- Create: `app/api/consent/route.ts`
- Create: `app/lib/client/consent.ts`
- Modify: `app/config/constants.ts` (`COPYRIGHT_NOTICE_VERSION`)

**Interfaces:**
- Consumes: `requireUser`
- Produces:
  - `export const COPYRIGHT_NOTICE_VERSION = '2026-07-29'`
  - `GET /api/consent` → `{ agreed: boolean }`
  - `POST /api/consent` → `{ ok: true }`
  - `export async function fetchConsent(): Promise<boolean>`
  - `export async function recordConsent(): Promise<boolean>`

- [ ] **Step 1: 상수 추가**

`app/config/constants.ts`에 추가:

```typescript
/**
 * Version of the copyright notice the user agrees to before their first
 * translation. Bump this when the wording changes materially and everyone is
 * asked again — an agreement to old wording is not an agreement to new wording.
 */
export const COPYRIGHT_NOTICE_VERSION = '2026-07-29';
```

- [ ] **Step 2: 마이그레이션 작성**

Create `supabase/migrations/0008_copyright_consents.sql`:

```sql
-- ZAMAK: 저작권 안내 동의 기록
--
-- Run this once in the Supabase SQL editor.
--
-- The upload terms put the rights and responsibility for uploaded files on the
-- user. That only means something if we can say when a given account agreed,
-- and to which wording.

create table if not exists public.copyright_consents (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  version  text not null,
  agreed_at timestamptz not null default now()
);

alter table public.copyright_consents enable row level security;

drop policy if exists "consents are readable by their owner" on public.copyright_consents;
create policy "consents are readable by their owner"
  on public.copyright_consents for select
  using (auth.uid() = user_id);

drop policy if exists "consents are insertable by their owner" on public.copyright_consents;
create policy "consents are insertable by their owner"
  on public.copyright_consents for insert
  with check (auth.uid() = user_id);

drop policy if exists "consents are updatable by their owner" on public.copyright_consents;
create policy "consents are updatable by their owner"
  on public.copyright_consents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 3: 라우트 작성**

Create `app/api/consent/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';
import { COPYRIGHT_NOTICE_VERSION } from '../../config/constants';

/** Whether this account has agreed to the CURRENT notice wording. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('copyright_consents')
    .select('version')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // An agreement to older wording does not carry forward — the modal shows
  // again, which is the point of versioning it.
  return NextResponse.json({
    agreed: data?.version === COPYRIGHT_NOTICE_VERSION,
  });
}

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { error } = await supabase.from('copyright_consents').upsert(
    {
      user_id: auth.user.id,
      version: COPYRIGHT_NOTICE_VERSION,
      agreed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 클라이언트 헬퍼 작성**

Create `app/lib/client/consent.ts`:

```typescript
/**
 * Whether the signed-in user has agreed to the current copyright notice.
 *
 * Fails closed (returns false → modal shows). Showing the notice one extra
 * time is harmless; skipping it because a fetch failed is not.
 */
export async function fetchConsent(): Promise<boolean> {
  try {
    const res = await fetch('/api/consent');
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { agreed?: boolean } | null;
    return body?.agreed === true;
  } catch {
    return false;
  }
}

/** Records agreement. Returns false when it did not stick, so the caller can
 *  keep the user on the modal rather than proceeding on an unsaved consent. */
export async function recordConsent(): Promise<boolean> {
  try {
    const res = await fetch('/api/consent', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/consent
```

Expected: 검증 통과 + `401`.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0008_copyright_consents.sql app/api/consent/route.ts app/lib/client/consent.ts app/config/constants.ts
git commit -m "$(cat <<'EOF'
저작권 안내 동의를 버전과 함께 기록한다.

업로드 약관이 파일의 권리와 책임을 사용자에게 두는데, 그 조항은 어느 계정이
언제 어떤 문구에 동의했는지 말할 수 있어야 의미가 있다. 문구가 바뀌면
COPYRIGHT_NOTICE_VERSION을 올려 전원에게 다시 묻는다 — 옛 문구 동의가 새 문구
동의는 아니다. 조회 실패는 미동의로 떨어진다(안내를 한 번 더 보는 건 무해하고,
fetch가 실패해서 건너뛰는 건 무해하지 않다).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — 위저드 상태 머신 분리

### Task 8: useWizard 훅 추출

**Files:**
- Create: `app/hooks/useWizard.ts`
- Create: `app/hooks/useWizard.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `useTranslation`, `useEnrich`, `useCastSheet`, `MovieInfo`, `ContentType`, `AllowedModel`
- Produces:
  - `export type WizardScreen = 'upload' | 'workPick' | 'settings' | 'progress' | 'done' | 'exhausted'`
  - `export function nextScreenAfterUpload(status: EnrichStatus): WizardScreen` — `'found'`이면 `'settings'`(설정 화면 확인 배너로), 그 외에는 `'workPick'`
  - `export function useWizard(...)` — 화면 상태와 전이 함수 묶음

**⚠️ 후보 개수로 판단하면 안 된다 (검증된 사실).** `useEnrich`를 읽어 확인한 실제 동작:

| API status | 훅 status | `candidates` | `enrich()` 반환 |
|---|---|---|---|
| `found` | `'found'` | **`[]`로 비운다** | `EnrichResult` |
| `ambiguous` | `'ambiguous'` | 후보 배열 | `null` |
| `not_found` | `'notFound'` | `[]` | `null` |

즉 **자동 인식 성공(`found`)일 때 `candidates.length`가 0**이다. 후보 수로 분기하면 확정 검색된 작품이 빈 목록의 선택 화면으로 가버린다. `EnrichStatus`(`'idle' | 'searching' | 'found' | 'ambiguous' | 'notFound'`, `app/hooks/useEnrich.ts`에서 export)를 그대로 받는다.

- [ ] **Step 1: 전이 규칙 테스트를 먼저 쓴다**

프로토타입의 핵심 분기 하나 — 후보가 1건으로 확정되면 작품 선택 화면을 건너뛰고 설정 화면의 확인 배너로 간다 — 를 순수 함수로 떼어 테스트한다. 나머지 전이는 React 상태라 컴포넌트 테스트 도구 없이는 검증할 수 없으므로 억지로 테스트하지 않는다.

Create `app/hooks/useWizard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { nextScreenAfterUpload } from './useWizard';

describe('nextScreenAfterUpload', () => {
  it('skips the picker when the search resolved to one confident match', () => {
    // A confident match is confirmed inline on the settings screen
    // ("'X'로 인식했어요. 맞나요?") — making the user pick from a list of one
    // is a step that asks nothing.
    expect(nextScreenAfterUpload('found')).toBe('settings');
  });

  it('shows the picker when the search was ambiguous', () => {
    expect(nextScreenAfterUpload('ambiguous')).toBe('workPick');
  });

  it('shows the picker when nothing was found, so the user can search', () => {
    expect(nextScreenAfterUpload('notFound')).toBe('workPick');
  });

  it('does not send a confident match to the picker just because candidates is empty', () => {
    // useEnrich clears `candidates` to [] on 'found'. Branching on the array's
    // length would route every auto-matched film into an empty picker.
    expect(nextScreenAfterUpload('found')).not.toBe('workPick');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run app/hooks/useWizard.test.ts
```

Expected: FAIL — `./useWizard` 모듈이 없다.

- [ ] **Step 3: useWizard 구현**

Create `app/hooks/useWizard.ts`. `app/page.tsx`의 45-312행에 있는 상태·핸들러를 그대로 옮긴다. **로직을 바꾸지 않는다** — 이 태스크는 순수 이동이고, 동작 변경은 Phase 3에서 화면과 함께 한다.

옮기는 것:
- state: `screen`(기존 `step`을 문자열로), `contentType`, `targetLang`, `movieInfo`, `uploadError`, `summarizing`
- refs: `movieInfoRef`, `fileContentRef`, `enrichStartedRef`, `summarizeStartedRef`
- 콜백: `onMetaUpdate`, `runEnrich`, `runSelectCandidate`, `resetAnalysis`, `handleFile`, `handleTranslate`, `handleCancel`, `resetAll`
- effects: 자동 분석 effect, castsheet effect

`page.tsx`에 남는 것: 인증 상태, 화면 렌더링, 헤더/푸터, URL 쿼리 처리(OAuth 에러).

파일 상단에 순수 함수를 둔다:

```typescript
/** Screens the signed-in wizard can be on. */
export type WizardScreen =
  | 'upload'
  | 'workPick'
  | 'settings'
  | 'progress'
  | 'done'
  | 'exhausted';

/**
 * Where to go once a file is read and the work search has settled.
 *
 * A confident match skips the picker: it is confirmed inline on the settings
 * screen instead, because a list of one asks the user nothing.
 *
 * Driven by the search's own status, not by how many candidates came back —
 * useEnrich clears `candidates` to [] on a confident match, so a length check
 * would route every auto-matched film into an empty picker.
 */
export function nextScreenAfterUpload(status: EnrichStatus): WizardScreen {
  return status === 'found' ? 'settings' : 'workPick';
}
```

훅은 상태 묶음과 전이 함수를 반환한다. 정확한 반환 타입을 아래로 고정한다 — Phase 3의 화면들이 이 이름들을 그대로 쓴다:

```typescript
export interface WizardState {
  screen: WizardScreen;
  contentType: ContentType;
  targetLang: string;
  movieInfo: MovieInfo;
  uploadError: string;
  summarizing: boolean;
  /** True once the work has been confirmed (explicitly or via the banner). */
  workConfirmed: boolean;
  /** True when the work came from a single confident match, so the settings
   *  screen shows the confirm banner instead of a settled card. */
  autoMatched: boolean;
}
```

`setContentType`, `setTargetLang`, `setMovieInfo`, `confirmWork()`, `goWorkPick()`, `handleFile(file)`, `handleTranslate(model)`, `handleCancel()`, `resetAll()`, `goScreen(screen)`를 함께 반환한다.

`workConfirmed` / `autoMatched`는 프로토타입에 있고 현재 코드에 없는 새 상태다 (`needsConfirm = autoMatched && !workConfirmed`). 여기서 도입한다.

`nextScreenAfterUpload`를 쓰는 자리는 **자동 분석 effect의 enrich 완료 지점**이다. 현재 `runEnrich`는 결과를 `movieInfo`에 병합하기만 하고 화면을 옮기지 않는다(`InfoStep`이 한 화면에서 다 했으므로). 분리된 뒤에는 enrich가 끝난 시점에 다음 화면을 결정해야 한다.

`enrich()`는 `EnrichResult | null`을 반환한다 — 확정 시에만 객체, `ambiguous`/`notFound`면 `null`이다. 반환값의 null 여부로도 판단할 수 있지만 `'ambiguous'`와 `'notFound'`가 구분되지 않으므로, 훅이 노출하는 `status`를 쓴다:

```typescript
      const data = await enrich(title, year);
      // …setMovieInfo 병합은 그대로 (기존 runEnrich 본문 유지)…
      // enrich()가 값을 반환했다 = 확정 매치. 이때만 확인 배너를 띄운다.
      const matched = data !== null;
      setAutoMatched(matched);
      setWorkConfirmed(false);
      setScreen(nextScreenAfterUpload(matched ? 'found' : enrichStatus));
```

`enrichStatus`는 `useEnrich()`가 반환하는 `status`다. **주의:** effect 안에서 `status`를 읽으면 이 렌더의 값이라 방금 끝난 요청의 결과가 아닐 수 있다 — 그래서 확정 여부는 `data !== null`(반환값, 항상 최신)로 판단하고, `status`는 `ambiguous`/`notFound`를 가르는 데만 쓴다. 두 경우 모두 `'workPick'`으로 가므로 이 구분이 틀려도 화면은 같다. 화면 안에서 "후보가 없어요"와 "골라 주세요"를 다르게 보여주려면 `candidates.length`를 그때 읽으면 된다.

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run app/hooks/useWizard.test.ts
```

Expected: PASS (3개)

- [ ] **Step 5: page.tsx를 훅 사용으로 전환**

`step` 숫자 비교(`step === 0` 등)를 `screen === 'upload'` 식으로 바꾼다. 화면 컴포넌트는 아직 구 컴포넌트를 그대로 렌더한다 — 이 태스크는 배선만 바꾼다.

- [ ] **Step 6: 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과. `page.tsx`가 497행에서 크게 줄어야 한다 (`wc -l app/page.tsx`로 확인, 250행 이하가 목표).

- [ ] **Step 7: 커밋**

```bash
git add app/hooks/useWizard.ts app/hooks/useWizard.test.ts app/page.tsx
git commit -m "$(cat <<'EOF'
위저드 상태 머신을 useWizard로 빼낸다.

화면이 5개에서 6개로 늘고 작품 확인 분기가 붙으면서 page.tsx가 상태 머신과
렌더링을 같이 들고 있기에 커졌다. 전이 로직을 훅으로 옮겨 page.tsx는 렌더링만
남기고, 단계 번호(step === 0)를 화면 이름으로 바꿔 읽을 수 있게 한다.

이 커밋은 순수 이동이다 — 동작 변경은 화면을 다시 쓸 때 함께 한다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — 화면

> Phase 3의 모든 태스크는 공통 절차를 따른다: ① `COPY`에 문구 추가 ② 컴포넌트 작성/교체 ③ `npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run` ④ Browser로 확인(로그인 필요한 화면은 컴파일까지만) ⑤ 커밋. 각 태스크의 스텝에서 반복하지 않고 여기 한 번만 적는다.

### Task 9: 랜딩 화면

**Files:**
- Modify: `app/components/simple/LandingPage.tsx` (전면 교체)
- Modify: `app/i18n/simpleCopy.ts` (`COPY.landing` 교체)
- Modify: `app/page.tsx` (비로그인 분기의 헤더 제거)

**Interfaces:**
- Consumes: `signIn` (from `useAuth`), `isSupabaseConfigured`
- Produces: `<LandingPage onSignIn={() => void} error={string} configured={boolean} />` — 기존 props를 그대로 유지한다 (호출부 변경 최소화)

- [ ] **Step 1: COPY 교체**

`app/i18n/simpleCopy.ts`의 `landing` 블록(27-128행)을 아래로 교체한다. 기존 챕터 랜딩 문구는 전부 삭제한다 — 남겨두면 어느 쪽이 살아 있는지 다음 사람이 알 수 없다.

```typescript
  landing: {
    /** Typed out one character at a time on mount. */
    wordmark: 'ZAMAK',
    tagline: '자막 파일 하나로, 자연스러운 한국어 자막을.',
    taglineSub: '타임코드는 그대로 지켜 드립니다.',
    signIn: 'Google로 계속하기',
    badge: '비공개 베타',
    notConfigured: '로그인이 아직 설정되지 않았어요.',
  },
```

- [ ] **Step 2: 컴포넌트 전면 교체**

`app/components/simple/LandingPage.tsx`를 아래 구조로 다시 쓴다. 313행의 챕터 스크롤은 전부 사라진다.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';

interface Props {
  onSignIn: () => void;
  error: string;
  configured: boolean;
}

/** ms per character of the wordmark reveal — 프로토타입 값. */
const TYPE_MS = 150;

export function LandingPage({ onSignIn, error, configured }: Props) {
  const word = COPY.landing.wordmark;
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTyped(word.slice(0, i));
      if (i >= word.length) clearInterval(timer);
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [word]);

  return (
    <div className='min-h-screen flex flex-col items-center justify-center px-10 py-10'>
      <h1 className='mono mb-[18px] inline-block bg-ink text-accent text-[42px] font-semibold tracking-[0.07em] leading-none px-7 py-4 rounded-[6px] text-center min-h-[42px]'>
        {typed}
        <span className='animate-zblink inline-block w-1 h-[34px] bg-accent ml-2 rounded-[2px] align-[-3px]' />
      </h1>
      <p className='mb-10 text-[19px] text-ink-3 text-center max-w-[460px] leading-[1.5]'>
        {COPY.landing.tagline}
        <br />
        {COPY.landing.taglineSub}
      </p>
      {configured ? (
        <button
          type='button'
          onClick={onSignIn}
          className='flex items-center gap-2.5 bg-surface text-ink-body text-[15px] font-medium px-7 py-[13px] rounded-full border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 active:scale-[0.98] transition'
        >
          <span className='w-[18px] h-[18px] rounded-full bg-accent text-ink flex items-center justify-center text-[11px] font-bold'>
            G
          </span>
          {COPY.landing.signIn}
        </button>
      ) : (
        <p className='text-sm text-danger'>{COPY.landing.notConfigured}</p>
      )}
      {error && <p className='mt-4 text-sm text-danger'>{error}</p>}
      <p className='mt-14 text-[12px] text-ink-5'>{COPY.landing.badge}</p>
    </div>
  );
}
```

프로토타입의 "베타 초대 코드로 입장" 버튼은 **넣지 않는다** (스펙 §2 — 초대 코드는 베타에 없다).

- [ ] **Step 3: page.tsx의 비로그인 분기 정리**

`app/page.tsx`의 `if (!user)` 블록에서 헤더(`<header>` … `</header>`)를 제거한다. 프로토타입 랜딩은 상단 네비가 없는 전체 화면이다. `<main className='w-full'>`만 남기고 `LandingPage`를 렌더한다.

- [ ] **Step 4: 검증 + Browser 확인**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

`preview_start` → `/`를 열어 확인한다. **이 화면은 비로그인이라 Claude가 직접 검증할 수 있다.** 확인 항목: 워드마크가 한 글자씩 타이핑되고 커서가 깜빡이는지, 배경이 `#f5f5f7`인지, 버튼 hover가 먹는지, 콘솔 에러가 없는지. `resize_window`로 mobile(375px)에서 가로 스크롤이 없는지도 본다.

- [ ] **Step 5: 커밋**

```bash
git add app/components/simple/LandingPage.tsx app/i18n/simpleCopy.ts app/page.tsx
git commit -m "$(cat <<'EOF'
랜딩을 비공개 베타용 미니멀 화면으로 교체한다.

Toss식 챕터 스크롤 랜딩(313행)을 지우고 타이핑 워드마크 + 한 줄 카피 +
Google 로그인만 남긴다. 비공개 베타에는 설득형 롱폼이 할 일이 없다.

초대 코드 입장 버튼은 넣지 않는다 — 베타에 초대 코드 기능이 없으므로 동작하지
않는 버튼을 화면에 두지 않는다.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 업로드 화면

**Files:**
- Modify: `app/components/simple/UploadStep.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.upload`)

**Interfaces:**
- Consumes: `ContentType`
- Produces: `<UploadStep contentType={ContentType | null} onContentType={(t: ContentType) => void} uploading={boolean} uploadingFileName={string} error={string} onFile={(f: File) => void} />`

`contentType`이 `null`을 허용하도록 바뀐다 — 프로토타입은 유형을 **고르기 전** 상태가 있고 그때 드롭존이 잠긴다. `useWizard`의 `contentType` state 타입도 `ContentType | null`로 바꾸고 초기값을 `null`로 한다 (기존 초기값 `'movie'`).

- [ ] **Step 1: COPY 갱신**

`COPY.upload`에 추가/교체한다. 기존 키(`invalidFile`, `unreadableFile`, `bilingualSmi`)는 `page.tsx`/`useWizard`가 쓰므로 **삭제하지 않는다**.

```typescript
    title: '파일 업로드',
    subtitle: '타임코드는 그대로, 대사만 자연스러운 한국어로 옮겨 드립니다.',
    kindLabel: '콘텐츠 유형',
    kindMovie: '영화 · 드라마',
    kindOther: '유튜브 · 일반 영상',
    dropTitle: '자막 파일을 여기에 놓으세요',
    dropFormats: '.srt .vtt .ass .smi · 원본 언어 자동 인식',
    dropButton: '파일 선택',
    dropLocked: '먼저 콘텐츠 유형을 선택하세요',
    readingTitle: (name: string) => `${name} 읽는 중…`,
    readingSub: '타임코드를 확인하고 작품을 찾고 있어요',
    noVideoNeeded: '영상 파일은 필요하지 않아요. 조잡한 자동 자막도 괜찮습니다.',
```

- [ ] **Step 2: 컴포넌트 재작성**

핵심 구조 (프로토타입 167-193행):

1. `<h1>` 제목 + 부제
2. 유형 세그먼트 컨트롤 — `bg-[rgba(0,0,0,0.05)] rounded-xl p-[3px] flex`, 선택된 쪽만 `bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.12)]`
3. 드롭존 — `rounded-card-lg bg-surface shadow-[var(--shadow-hover)] p-[60px_40px]`, `contentType === null`이면 `opacity-50` + 클릭·드롭 무시
4. `uploading`일 때 문서 아이콘에 `animate-zbreathe` + "읽는 중…" 문구, 아닐 때 정적 아이콘 + 안내
5. 하단 `noVideoNeeded` 한 줄

유형 미선택 시 **드롭 이벤트와 클릭 둘 다 막는다** — 시각적으로만 흐리게 하고 드롭이 먹으면 잠금이 아니다.

```tsx
  const locked = contentType === null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (locked || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
```

기존 파일의 `<input type='file'>` + `LanguageSelect` 배선은 참고해 옮긴다. **`LanguageSelect`는 화면에서 빠진다** (도착어 단일) — import를 제거하되 파일은 남긴다.

- [ ] **Step 3: useWizard의 contentType 타입 변경**

`ContentType | null`, 초기값 `null`, `resetAll`에서 `null`로 되돌린다. `handleFile`은 `contentType`이 null이면 즉시 반환한다(방어).

자동 분석 effect의 `contentType === 'movie'` 분기는 그대로 동작한다(`null`은 어느 쪽도 아님).

- [ ] **Step 4: 검증 + 커밋**

공통 절차. 커밋 메시지:

```
업로드 화면에서 콘텐츠 유형을 먼저 고르게 한다.

유형이 다음 화면에 있어서 순서가 뒤바뀌어 있었다. 유형을 드롭존 위로 올리고,
고르기 전에는 드롭존을 잠근다 — 흐리게만 하고 드롭이 먹으면 잠금이 아니라서
클릭과 drop 이벤트를 둘 다 막는다.

도착어 선택은 화면에서 빠진다(한국어 단일). 컴포넌트 파일은 확장 때 쓰므로 남긴다.
```

---

### Task 11: 작품 인식 화면

**Files:**
- Create: `app/components/beta/WorkPickStep.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.workPick` 신규)
- Modify: `app/page.tsx` (배선)

**Interfaces:**
- Consumes: `EnrichCandidate` (from `app/hooks/useEnrich`), `MovieInfo`, `ContentType`
- Produces: `<WorkPickStep contentType={ContentType} fileName={string} candidates={EnrichCandidate[]} selectedIndex={number} onSelect={(i: number) => void} onSearch={(q: string) => void} searching={boolean} otherType={string} onOtherType={(t: string) => void} toneText={string} onToneText={(t: string) => void} onConfirm={() => void} />`

**⚠️ 프로토타입 카드와 실제 데이터가 다르다.** `EnrichCandidate`의 실제 필드는 이것뿐이다:

```typescript
export interface EnrichCandidate {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  year: string;
  overview: string;
  posterUrl: string | null;
}
```

프로토타입 카드는 **감독**(`director`)과 **시대배경 한 줄**(`era`)을 보여주는데 후보 단계에는 그 데이터가 없다 — 감독·era·tone은 사용자가 후보를 고른 **뒤** `selectCandidate`가 채운다(TMDB details + aux 모델 콜). 후보 목록에 그걸 넣으려면 후보마다 details를 조회해야 하고, 그건 후보 3건에 API 콜 3번을 더 쓰는 것이다.

**결정: 후보 카드는 있는 필드만 쓴다** — 포스터 / 제목 / 연도 / `overview` 2줄 클램프 / 영화·드라마 배지(`mediaType`). 감독과 시대배경은 다음 화면(설정)의 확정 카드에서 보여준다. 없는 필드를 만들지 않는다.

- [ ] **Step 1: 후보 카드 마크업**

```tsx
<button
  type='button'
  onClick={() => onSelect(i)}
  className='flex gap-[18px] items-center w-full text-left rounded-card p-4 px-5 border-[1.5px] transition hover:shadow-[var(--shadow-hover)]'
  style={{
    background: selected ? 'var(--accent-wash)' : 'var(--surface)',
    borderColor: selected ? 'var(--ink)' : 'transparent',
  }}
>
  {c.posterUrl ? (
    <img
      src={c.posterUrl}
      alt=''
      className='w-14 h-20 rounded-lg flex-none object-cover'
    />
  ) : (
    <div className='w-14 h-20 rounded-lg flex-none bg-surface-2 flex items-center justify-center mono text-[9px] text-ink-5'>
      {COPY.workPick.posterEmpty}
    </div>
  )}
  <div className='flex-1 min-w-0'>
    <div className='text-[16px] font-semibold tracking-[-0.01em] truncate'>
      {c.title}
    </div>
    <div className='text-[13px] text-ink-3 mt-[3px]'>
      {c.year}
      {' · '}
      {c.mediaType === 'tv' ? COPY.workPick.kindTv : COPY.workPick.kindMovie}
    </div>
    {c.overview && (
      <div className='text-[12.5px] text-ink-4 mt-1.5 line-clamp-2'>
        {c.overview}
      </div>
    )}
  </div>
  <div
    className='w-[22px] h-[22px] rounded-full flex-none border-[1.5px] flex items-center justify-center text-white text-[12px]'
    style={{
      borderColor: selected ? 'var(--ink)' : 'var(--border-strong)',
      background: selected ? 'var(--ink)' : 'var(--surface)',
    }}
  >
    {selected ? '✓' : ''}
  </div>
</button>
```

`line-clamp-2`는 Tailwind 4에 내장되어 있다. `posterUrl`은 TMDB 도메인이므로 `next.config`의 `images` 설정 없이 쓰려면 `<img>`를 쓴다(현재 `InfoStep`도 `<img>`를 쓴다 — 같은 방식을 따른다).

- [ ] **Step 2: COPY 추가**

```typescript
  workPick: {
    sourceLangBadge: '원본 언어: 자동 인식',
    title: '어떤 작품인가요?',
    subtitle: '작품을 골라 주시면 시대배경과 말투까지 조율해 번역해요.',
    posterEmpty: 'poster',
    kindMovie: '영화',
    kindTv: '드라마',
    searchOpen: '찾는 작품이 없어요',
    searchClose: '검색 닫기',
    searchPlaceholder: '작품 제목을 검색하세요',
    // enrich()는 제목+연도만 받는다. 감독으로 찾아준다고 쓰면 못 지키는 약속이 된다.
    searchHint: '제목으로 다시 찾아 드려요. 못 찾아도 번역은 계속할 수 있어요.',
    confirm: '이 작품으로 계속',
    otherTypeLabel: '콘텐츠 유형',
    otherTypes: ['유튜브', '강연·인터뷰', '브이로그', '기타'],
    toneLabel: '원하는 톤앤매너',
    tonePlaceholder: '예: 친근한 반말, 유튜브 예능 자막처럼 리듬감 있게',
  },
```

- [ ] **Step 3: 컴포넌트 작성**

영화 분기: 후보 카드 목록 + "찾는 작품이 없어요" 토글 검색 + 하단 고정 확인 바.
일반 영상 분기: 유형 칩 + 톤앤매너 textarea (확인 바는 항상 활성).

카드 선택 상태: `bg-accent-wash border-ink`, 미선택 `bg-surface border-transparent`. 우측 라디오 점은 선택 시 `bg-ink` + `✓`.

하단 고정 바:

```tsx
<div className='fixed bottom-0 left-0 right-0 flex justify-center p-4 bg-[var(--nav-bg)] backdrop-blur-[20px] backdrop-saturate-[180%] border-t border-border'>
  <button
    type='button'
    disabled={!canConfirm}
    onClick={onConfirm}
    className='text-white text-[15px] font-medium px-11 py-[13px] rounded-full transition active:scale-[0.98] disabled:cursor-default'
    style={{ background: canConfirm ? 'var(--ink)' : '#c7c7cc' }}
  >
    {COPY.workPick.confirm}
  </button>
</div>
```

- [ ] **Step 4: page.tsx 배선 + 검증 + 커밋**

`screen === 'workPick'`에서 렌더한다. 커밋 메시지:

```
작품 인식을 전용 화면으로 분리한다.

InfoStep(432행)이 작품 확정과 번역 설정을 한 화면에서 하고 있었다. 프로토타입은
둘을 나누고, 후보가 1건으로 확정되면 이 화면을 건너뛰어 설정 화면의 확인 배너로
간다. 이 커밋은 앞쪽 절반이다.
```

---

### Task 12: 번역 설정 화면

**Files:**
- Create: `app/components/beta/TranslateSettingsStep.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.settings` 신규)
- Modify: `app/page.tsx`
- Modify: `app/components/simple/CastSheetCard.tsx` (스타일만 신규 토큰에 맞춤)

**Interfaces:**
- Consumes: `MovieInfo`, `CreditBalances`, `AllowedModel`, `FLASH_MODEL`, `PRO_MODEL`, `CastSheet`, `useCastSheet` 반환
- Produces: `<TranslateSettingsStep movieInfo={MovieInfo} onMovieInfo={(patch: Partial<MovieInfo>) => void} needsConfirm={boolean} onConfirmWork={() => void} onChangeWork={() => void} model={AllowedModel} onModel={(m: AllowedModel) => void} credits={CreditBalances | null} castSheetEnabled={boolean} onCastSheetToggle={(on: boolean) => void} castSheetStatus={string} castSheet={CastSheet | undefined} onCastSheetChange={(s: CastSheet) => void} etaSeconds={number} onStart={() => void} />`

**⚠️ 프로토타입의 "작품 맥락" 단일 텍스트박스는 우리 데이터와 맞지 않는다.** 프로토타입은 `workContext` 문자열 하나를 쓰지만, 우리는 enrich가 `era`(시대·배경)와 `tone`(톤앤매너)를 **분리된 키워드 필드**로 채운다. 하나로 합쳐 보여주고 편집분을 다시 쪼개는 것은 손실이 있고(구분자가 사라진다), 합친 문자열을 `era`에만 밀어넣으면 `tone`이 조용히 버려진다.

**결정: 라벨 붙은 입력 두 개로 나눈다** — "시대 · 배경"(`era`)과 "톤앤매너"(`tone`). 프로토타입보다 입력이 하나 늘지만 데이터 모양을 그대로 따르고, 사용자가 어느 쪽을 고치는지 알 수 있다. `notes`(사용자 자유 입력 전용 필드)는 이 화면에서 건드리지 않는다 — 버킷 분리(불변식 4)를 지킨다.

- [ ] **Step 1: COPY 추가**

```typescript
  settings: {
    title: '번역 설정',
    subtitleAuto: '원본 언어 자동 인식 → 한국어',
    confirmQuestion: (work: string) => `'${work}'(으)로 인식했어요. 맞나요?`,
    confirmHint: '아니라면 다시 골라 주세요',
    confirmYes: '맞아요',
    confirmNo: '아니에요',
    changeWork: '작품 변경',
    eraLabel: '시대 · 배경',
    eraPlaceholder: '예: 1920년대 아일랜드 해안, 고립된 등대',
    toneLabel: '톤앤매너',
    tonePlaceholder: '예: 고전적이고 절제된 어투, 심리극',
    contextEditable: '(수정 가능)',
    contextHint: '번역에 그대로 반영돼요. 비워 두면 자막만 보고 판단해요.',
    liteName: '라이트',
    liteDesc: '빠르고 정확한 기본 번역.',
    proName: '프로',
    proDesc: '작품 맥락 분석과 인물명 일관성. 후편집 시간을 줄이는 초벌 번역.',
    creditsLeft: (n: number) => `${n}회 남음`,
    glossaryTitle: '용어집 · 말투 설정',
    glossaryBadge: '고급',
    glossaryDesc:
      '인물명 표기를 고정하고 인물 간 존대·반말을 지정해요. 약 20초 더 걸려요.',
    eta: (sec: number) => `예상 소요 약 ${sec}초`,
    start: '번역 시작',
  },
```

- [ ] **Step 2: 컴포넌트 작성**

구성 (프로토타입 251-346행):

1. 확인 배너 (`needsConfirm`일 때만) — `bg-accent-wash border-accent-line`, 맞아요/아니에요 버튼
2. 확정 카드 (`!needsConfirm`) — 포스터 + 제목 + 배지 + "작품 변경"
3. 맥락 카드 — "시대 · 배경"(`era`)과 "톤앤매너"(`tone`) 입력 2개 + `contextHint` 한 줄. 편집은 `onMovieInfo({ era: … })` / `onMovieInfo({ tone: … })`로 올린다
4. 라이트/프로 2카드 그리드. 잔여가 0인 쪽도 **선택 가능하게 둔다** — 소진 화면이 그 사실을 알려주는 자리이고, 카드를 잠그면 왜 못 고르는지 설명할 곳이 없어진다:

```tsx
const CARDS = [
  { model: FLASH_MODEL, name: COPY.settings.liteName, desc: COPY.settings.liteDesc, left: credits?.lite ?? 0 },
  { model: PRO_MODEL, name: COPY.settings.proName, desc: COPY.settings.proDesc, left: credits?.pro ?? 0 },
] as const;

<div className='grid grid-cols-2 gap-[14px] mb-[14px]'>
  {CARDS.map((c) => (
    <button
      key={c.model}
      type='button'
      onClick={() => onModel(c.model)}
      className='bg-surface rounded-card border-[1.5px] p-[22px_24px] text-left transition hover:shadow-[var(--shadow-hover)]'
      style={{ borderColor: model === c.model ? 'var(--ink)' : 'transparent' }}
    >
      <div className='flex justify-between items-baseline'>
        <span className='text-[17px] font-semibold tracking-[-0.01em]'>{c.name}</span>
        <span
          className='text-[12px] font-medium'
          style={{ color: c.left > 0 ? 'var(--success)' : 'var(--danger)' }}
        >
          {COPY.settings.creditsLeft(c.left)}
        </span>
      </div>
      <p className='mt-2 text-[13.5px] text-ink-3 leading-[1.5]'>{c.desc}</p>
    </button>
  ))}
</div>
```

5. 용어집·말투 카드 + 토글 스위치. 켜면 `CastSheetCard`를 펼친다(`animate-zslide`)
6. 하단 고정 바: ETA + "번역 시작"

**토글이 꺼져 있으면 `CastSheetCard`를 렌더하지 않는다** (불변식 4 — 버킷이 프롬프트에 나타나지 않는 것과 화면에 나타나지 않는 것을 일치시킨다).

ETA는 기존 `estimateTranslationMs`/`TRANSLATION_ESTIMATE_MS`를 쓴다 — 새로 계산식을 만들지 않는다. 용어집 ON일 때 `GLOSSARY_WAIT_MS`를 더한다.

- [ ] **Step 3: 배선 + 검증 + 커밋**

`screen === 'settings'`. 커밋 메시지:

```
번역 설정을 전용 화면으로 분리하고 모델 카드에 잔여 번역권을 붙인다.

InfoStep 분리의 뒤쪽 절반이다. 자동 인식된 작품은 상단 배너에서 확인만 받고,
라이트/프로 카드가 각자의 잔여 회수를 보여준다. 화면 문구만 라이트/프로이고
모델 상수는 FLASH_MODEL/PRO_MODEL 그대로다.

용어집 토글이 꺼져 있으면 카드를 렌더하지 않는다 — 프롬프트에 안 나타나는 것과
화면에 안 나타나는 것을 일치시킨다(불변식 4).
```

---

### Task 13: 진행 화면 4스테이지

**Files:**
- Create: `app/lib/progressStages.ts`
- Create: `app/lib/progressStages.test.ts`
- Modify: `app/components/simple/ProgressStep.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.progress`)

**Interfaces:**
- Consumes: `TranslationProgress` (from `app/types/translation.ts`)
- Produces:
  - `export type StageKey = 'context' | 'glossary' | 'translate' | 'verify'`
  - `export interface StageView { key: StageKey; state: 'pending' | 'active' | 'done' | 'skipped' }`
  - `export function overallPercent(p: TranslationProgress, opts: { enrichDone: boolean; glossaryEnabled: boolean; glossaryDone: boolean }): number`
  - `export function stageViews(percent: number, glossaryEnabled: boolean): StageView[]`

- [ ] **Step 1: 테스트를 먼저 쓴다**

Create `app/lib/progressStages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { overallPercent, stageViews } from './progressStages';
import type { TranslationProgress } from '../types/translation';

const idle: TranslationProgress = {
  stage: 'idle',
  currentChunk: 0,
  totalChunks: 0,
  estimatedRemainingMs: 0,
  lastUpdateTimestamp: 0,
  totalEstimateMs: 0,
  sweepRecovered: 0,
  sweepRemaining: 0,
};

describe('overallPercent', () => {
  it('stays inside the context band before enrich finishes', () => {
    const pct = overallPercent(idle, {
      enrichDone: false,
      glossaryEnabled: false,
      glossaryDone: false,
    });
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThan(15);
  });

  it('maps chunk progress into the translate band', () => {
    // Half the chunks done sits halfway through 25–90%.
    const pct = overallPercent(
      { ...idle, stage: 'translating', currentChunk: 5, totalChunks: 10 },
      { enrichDone: true, glossaryEnabled: false, glossaryDone: false },
    );
    expect(pct).toBeGreaterThan(50);
    expect(pct).toBeLessThan(62);
  });

  it('reaches the verify band during the recovery sweep', () => {
    const pct = overallPercent(
      { ...idle, stage: 'recovering', currentChunk: 10, totalChunks: 10 },
      { enrichDone: true, glossaryEnabled: false, glossaryDone: false },
    );
    expect(pct).toBeGreaterThanOrEqual(90);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('never goes backwards when totalChunks is still zero', () => {
    // The chunk count arrives after the job opens; a divide-by-zero here used
    // to render NaN% on screen.
    const pct = overallPercent(
      { ...idle, stage: 'translating', currentChunk: 0, totalChunks: 0 },
      { enrichDone: true, glossaryEnabled: false, glossaryDone: false },
    );
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(25);
  });
});

describe('stageViews', () => {
  it('marks the glossary stage skipped when the toggle is off', () => {
    const views = stageViews(50, false);
    expect(views.find((v) => v.key === 'glossary')?.state).toBe('skipped');
  });

  it('walks active through the bands as percent climbs', () => {
    expect(stageViews(5, true).find((v) => v.key === 'context')?.state).toBe('active');
    expect(stageViews(50, true).find((v) => v.key === 'translate')?.state).toBe('active');
    expect(stageViews(95, true).find((v) => v.key === 'verify')?.state).toBe('active');
  });

  it('marks earlier stages done once past their band', () => {
    const views = stageViews(95, true);
    expect(views.find((v) => v.key === 'context')?.state).toBe('done');
    expect(views.find((v) => v.key === 'translate')?.state).toBe('done');
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run app/lib/progressStages.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create `app/lib/progressStages.ts`:

```typescript
import type { TranslationProgress } from '../types/translation';

/** The four stages the progress screen shows, in order. */
export type StageKey = 'context' | 'glossary' | 'translate' | 'verify';

export interface StageView {
  key: StageKey;
  state: 'pending' | 'active' | 'done' | 'skipped';
}

/**
 * Percent bands per stage.
 *
 * Translation owns 25–90 because it is almost all of the wall clock; the other
 * three would otherwise each look as slow as the part that actually takes
 * minutes. The progress bar is driven by real chunk counts inside that band,
 * never by a timer — a bar that moves while nothing happens is a lie the user
 * eventually catches.
 */
const BANDS: Record<StageKey, [number, number]> = {
  context: [0, 15],
  glossary: [15, 25],
  translate: [25, 90],
  verify: [90, 100],
};

const STAGE_ORDER: StageKey[] = ['context', 'glossary', 'translate', 'verify'];

function lerp(band: [number, number], ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return band[0] + (band[1] - band[0]) * clamped;
}

export function overallPercent(
  p: TranslationProgress,
  opts: { enrichDone: boolean; glossaryEnabled: boolean; glossaryDone: boolean },
): number {
  if (!opts.enrichDone) return lerp(BANDS.context, 0.5);
  if (opts.glossaryEnabled && !opts.glossaryDone) return lerp(BANDS.glossary, 0.5);

  if (p.stage === 'recovering' || p.stage === 'finalizing') {
    return lerp(BANDS.verify, p.stage === 'finalizing' ? 0.8 : 0.3);
  }
  if (p.stage === 'done') return 100;

  // totalChunks is 0 until the first chunk event lands. Pin to the band floor
  // rather than dividing by zero — that rendered NaN% before.
  const ratio = p.totalChunks > 0 ? p.currentChunk / p.totalChunks : 0;
  return lerp(BANDS.translate, ratio);
}

export function stageViews(percent: number, glossaryEnabled: boolean): StageView[] {
  return STAGE_ORDER.map((key) => {
    if (key === 'glossary' && !glossaryEnabled) {
      return { key, state: 'skipped' as const };
    }
    const [start, end] = BANDS[key];
    if (percent >= end) return { key, state: 'done' as const };
    if (percent >= start) return { key, state: 'active' as const };
    return { key, state: 'pending' as const };
  });
}
```

- [ ] **Step 4: 통과 확인**

```bash
npx vitest run app/lib/progressStages.test.ts
```

Expected: PASS (7개)

- [ ] **Step 5: COPY 갱신**

`COPY.progress`에 추가한다. 기존 `cancelConfirm`은 유지한다.

```typescript
    stages: {
      context: '자막 맥락을 분석하는 중',
      glossary: '인물과 용어를 정리하는 중',
      translate: '자막을 번역하는 중',
      verify: '타임코드를 검증하는 중',
    },
    stageSkipped: '건너뜀',
    pct: (pct: number, sec: number) =>
      `${String(Math.floor(pct)).padStart(2, '0')}% · 약 ${sec}초 남음`,
    keepOpen: '창을 닫아도 번역은 계속돼요',
```

- [ ] **Step 6: ProgressStep 재작성**

프로토타입 348-366행 구조: 큰 제목(현재 활성 스테이지 문구) + 모노 퍼센트 라벨 + 6px 옐로 진행바 + 4스테이지 체크리스트 카드. 활성 스테이지 점은 `animate-zbreathe`, 완료는 `bg-success` + `✓`, 건너뜀은 `opacity-40` + `건너뜀` 라벨.

`overallPercent`에 넘길 `enrichDone` / `glossaryEnabled` / `glossaryDone`을 props로 받는다.

- [ ] **Step 7: 배선 + 검증 + 커밋**

커밋 메시지:

```
진행 화면을 4스테이지로 바꾸고 퍼센트를 실제 진행에 묶는다.

프로토타입은 4단계 체크리스트를 가짜 타이머로 굴리지만, 우리는 청크 완료 비율이
이미 SSE로 오니 그걸 쓴다. 번역 구간이 벽시계의 거의 전부라 25~90%를 주고
나머지 셋에 좁은 밴드를 준다 — 안 그러면 짧은 단계가 긴 단계만큼 느려 보인다.

totalChunks가 0인 창(첫 청크 이벤트 전)에 NaN%가 뜨던 것을 밴드 하한으로 고정한다.
```

---

### Task 14: 완료 화면 (리포트 + 피드백)

**Files:**
- Create: `app/lib/doneReport.ts`
- Create: `app/lib/doneReport.test.ts`
- Modify: `app/components/simple/DoneStep.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.done`)

**Interfaces:**
- Consumes: `TranslationResult`, `MovieInfo`, `CastSheet`
- Produces:
  - `export interface ReportItem { key: 'timecode' | 'context' | 'glossary' | 'relations'; params?: Record<string, number | string> }`
  - `export function buildReport(result: TranslationResult, ctx: { movieInfo: MovieInfo; castSheet?: CastSheet }): ReportItem[]`

**리포트에는 실측 가능한 것만 넣는다.** 프로토타입의 "긴 자막 23곳 CPS 조정"은 우리가 계측하지 않으므로 넣지 않는다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

Create `app/lib/doneReport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildReport } from './doneReport';
import type { TranslationResult } from '../types/translation';
import type { MovieInfo } from '../types/translation';

const result: TranslationResult = {
  content: '',
  filename: 'x.ko.srt',
  downloads: [],
  lineCount: 1204,
  durationMs: 30_000,
  fallbackBlocks: 0,
};

const bareInfo: MovieInfo = { title: '', year: '', notes: '' };

describe('buildReport', () => {
  it('always reports the verified timecode count and leftover originals', () => {
    const items = buildReport(result, { movieInfo: bareInfo });
    const timecode = items.find((i) => i.key === 'timecode');
    expect(timecode?.params).toEqual({ lines: 1204, fallback: 0 });
  });

  it('reports era and tone only when enrich actually filled them', () => {
    expect(buildReport(result, { movieInfo: bareInfo }).some((i) => i.key === 'context')).toBe(
      false,
    );
    const withEra = buildReport(result, {
      movieInfo: { ...bareInfo, era: '1920년대 아일랜드 해안' },
    });
    expect(withEra.some((i) => i.key === 'context')).toBe(true);
  });

  it('reports glossary counts only when a sheet was used', () => {
    const noSheet = buildReport(result, { movieInfo: bareInfo });
    expect(noSheet.some((i) => i.key === 'glossary')).toBe(false);

    const withSheet = buildReport(result, {
      movieInfo: bareInfo,
      castSheet: {
        terms: [
          { source: 'Thomas', target: '토마스', kind: 'person' },
          { source: 'Keeper', target: '등대지기', kind: 'term' },
        ],
        relations: [{ from: '핀', to: '토마스', speech: 'formal' }],
      },
    });
    expect(withSheet.find((i) => i.key === 'glossary')?.params).toEqual({ terms: 2 });
    expect(withSheet.find((i) => i.key === 'relations')?.params).toEqual({ pairs: 1 });
  });

  it('never invents a metric we do not measure', () => {
    // The prototype showed a "CPS 조정 23곳" line. We do not count that, so it
    // must not appear — a report the user cannot trust is worse than a short one.
    const keys = buildReport(result, { movieInfo: bareInfo }).map((i) => i.key);
    expect(keys).not.toContain('cps');
  });
});
```

`CastSheet`의 실제 필드명(`terms` / `relations`)을 `app/types/glossary.ts`에서 확인하고 다르면 테스트를 실제 타입에 맞춘다.

- [ ] **Step 2: 실패 확인 → Step 3: 구현 → Step 4: 통과 확인**

```bash
npx vitest run app/lib/doneReport.test.ts
```

Create `app/lib/doneReport.ts`:

```typescript
import type { MovieInfo, TranslationResult } from '../types/translation';
import type { CastSheet } from '../types/glossary';

/** One line of the "이 번역에 실제로 적용된 것" list. `key` selects the copy. */
export interface ReportItem {
  key: 'timecode' | 'context' | 'glossary' | 'relations';
  params?: Record<string, number | string>;
}

/**
 * What we can honestly say about a finished translation.
 *
 * Every item here is backed by a number we actually measured. The prototype
 * also showed a CPS-adjustment count, which we do not track — a report with an
 * invented number in it costs more trust than the extra line buys.
 */
export function buildReport(
  result: TranslationResult,
  ctx: { movieInfo: MovieInfo; castSheet?: CastSheet },
): ReportItem[] {
  const items: ReportItem[] = [
    {
      key: 'timecode',
      params: { lines: result.lineCount, fallback: result.fallbackBlocks ?? 0 },
    },
  ];

  // era/tone are the AI-facing bucket enrich fills. Empty means the lookup
  // found nothing, and claiming we tuned for a period we never learned is a lie.
  const { era, tone } = ctx.movieInfo;
  if (era || tone) {
    items.push({ key: 'context', params: { context: era || tone || '' } });
  }

  const terms = ctx.castSheet?.terms?.length ?? 0;
  if (terms > 0) items.push({ key: 'glossary', params: { terms } });

  const pairs = ctx.castSheet?.relations?.length ?? 0;
  if (pairs > 0) items.push({ key: 'relations', params: { pairs } });

  return items;
}
```

- [ ] **Step 5: COPY 갱신**

```typescript
    title: '번역이 끝났어요',
    summary: (model: string, lines: number) =>
      `${model} · ${lines.toLocaleString()}줄 번역 완료`,
    download: (name: string) => `${name} 다운로드`,
    reportTitle: '이 번역에 실제로 적용된 것',
    report: {
      timecode: (lines: number, fallback: number) =>
        fallback === 0
          ? `타임코드 ${lines.toLocaleString()}개를 검증했어요. 원문 그대로 남은 구간은 0줄입니다`
          : `타임코드 ${lines.toLocaleString()}개를 검증했어요. 원문 그대로 남은 구간은 ${fallback}줄입니다`,
      context: (context: string) => `작품 맥락(${context})에 맞춰 어휘와 문체를 골랐어요`,
      glossary: (terms: number) => `용어집 ${terms}개 표기를 자막 전체에 일관되게 적용했어요`,
      relations: (pairs: number) => `설정한 존대·반말 관계 ${pairs}쌍을 대화 전체에 반영했어요`,
    },
    feedbackTitle: '이번 번역, 어땠나요?',
    feedbackPlaceholder: '자유롭게 남겨주세요 (선택)',
    feedbackSend: '보내기',
    feedbackThanks: '의견 감사해요. 베타를 다듬는 데 큰 힘이 됩니다.',
    feedbackFailed: '의견을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
    again: '새 파일 번역하기',
    goHistory: '내 번역 보기',
```

- [ ] **Step 6: DoneStep 재작성**

구조 (프로토타입 368-431행): 체크 원형 + 제목 + 요약줄 → 다운로드 버튼 → 리포트 카드 → 피드백 카드(별점 5개 + 인풋 + 보내기) → 하단 링크 2개.

별점은 `sendFeedback(jobId, rating, comment)`를 호출한다. 성공하면 감사 문구로 바뀌고, 실패하면 `feedbackFailed`를 보이고 다시 시도할 수 있게 남긴다. `jobId`가 `null`이면 피드백 카드를 렌더하지 않는다(달 곳이 없다).

- [ ] **Step 7: 배선 + 검증 + 커밋**

커밋 메시지:

```
완료 화면에 적용 내역 리포트와 별점 피드백을 붙인다.

리포트는 실측한 수치만 낸다. 프로토타입에 있던 "긴 자막 23곳 CPS 조정"은 우리가
계측하지 않으므로 넣지 않는다 — 못 믿을 숫자 한 줄이 리포트 전체의 신뢰를 깎는다.

별점은 베타가 품질을 재는 유일한 정량 신호다. 저장 실패는 감사 문구로 위장하지
않고 다시 시도할 수 있게 남긴다.
```

---

### Task 15: 소진 화면 (대기자 등록)

**Files:**
- Create: `app/components/beta/ExhaustedStep.tsx`
- Delete: `app/components/simple/CreditWall.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.exhausted` 신규, `COPY.credits` 정리)
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `CreditKind`, `joinWaitlist`, 사용자 이메일 (from `useAuth` / `/api/credits`)
- Produces: `<ExhaustedStep kind={CreditKind} defaultEmail={string} onGoHistory={() => void} onBack={() => void} />`

`useTranslation`의 `refusal`이 `JobRefusedError`고 이제 `kind`를 들고 있다. `code === 'insufficient_credits'`면 `ExhaustedStep`, `code === 'file_too_large'`면 블록 초과 메시지 — 이 둘은 다른 상황이므로 화면에서 구분한다. 파일 초과 문구는 기존 `COPY.credits`에서 가져온다.

- [ ] **Step 1: COPY 추가**

```typescript
  exhausted: {
    title: (kind: string) => `${kind} 번역권을 모두 썼어요`,
    kindLite: '라이트',
    kindPro: '프로',
    body: '결제 기능을 준비하고 있어요.\n준비되면 가장 먼저 알려드릴게요. 파일은 안전하게 보관됩니다.',
    waitlistLabel: '결제 오픈 대기자 등록',
    emailPlaceholder: '이메일 주소',
    join: '등록',
    joined: '대기자로 등록됐어요. 오픈하면 바로 메일을 드릴게요.',
    joinFailed: '등록하지 못했어요. 이메일을 확인해 주세요.',
    goHistory: '지난 번역 다시 받기',
    back: '설정으로 돌아가기',
  },
```

프로토타입의 친구 초대 항목은 **넣지 않는다** (스펙 §2).

- [ ] **Step 2: 컴포넌트 작성 + CreditWall 삭제**

프로토타입 466-497행. `0` 원형 + 제목 + 본문 + 대기자 등록 카드 + 하단 링크 2개.

이메일 기본값은 로그인 계정 이메일이다 — 이미 아는 값을 다시 입력하게 하지 않는다. `/api/credits`가 `email`을 반환하므로 `useAuth`에 노출한다 (`email: string | null`).

```bash
git rm app/components/simple/CreditWall.tsx
```

`page.tsx`의 `CreditWall` import와 렌더를 `ExhaustedStep`으로 바꾼다.

- [ ] **Step 3: 검증 + 커밋**

커밋 메시지:

```
번역권 소진 화면을 대기자 등록으로 바꾼다.

베타에는 결제창이 없으니 소진 화면이 막다른 골목이 되지 않게 대기자 등록을 둔다.
이메일은 로그인 계정 값을 기본으로 채운다 — 아는 값을 다시 묻지 않는다.

친구 초대 항목은 넣지 않는다(베타에 초대 기능이 없다). CreditWall은 삭제한다.
```

---

### Task 16: 저작권 동의 모달

**Files:**
- Create: `app/components/beta/CopyrightModal.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.copyright` 신규)
- Modify: `app/hooks/useWizard.ts` (동의 게이트)
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `fetchConsent`, `recordConsent` (from `app/lib/client/consent.ts`)
- Produces: `<CopyrightModal onAgree={() => void} pending={boolean} error={string} />`

- [ ] **Step 1: COPY 추가**

```typescript
  copyright: {
    title: '시작하기 전에',
    body:
      'ZAMAK은 이용자가 적법하게 보유한 자막 파일의 번역만 지원해요. ' +
      '업로드하는 파일에 대한 권리와 책임은 이용자에게 있습니다.',
    checkbox: '저작권 안내를 확인했고, 이에 동의합니다',
    agree: '동의하고 시작하기',
    failed: '동의를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
```

- [ ] **Step 2: 컴포넌트 작성**

프로토타입 499-511행. `fixed inset-0 bg-black/40` 오버레이 + `rounded-card-lg` 카드 + 체크박스 + 버튼. 체크 전에는 버튼이 `#c7c7cc`로 비활성.

- [ ] **Step 3: 동의 게이트 배선**

`useWizard`에 상태를 추가한다.

- 로그인 직후 `fetchConsent()`를 한 번 호출해 `consentAgreed`를 세팅
- `handleTranslate`의 **맨 앞**에서 `consentAgreed`가 false면 모달을 띄우고 반환한다. 동의 후 번역을 이어서 시작한다
- `recordConsent()`가 false면 모달을 닫지 않는다 — 저장 안 된 동의로 진행하면 기록이 남지 않아 모달의 목적이 사라진다

- [ ] **Step 4: 검증 + 커밋**

커밋 메시지:

```
첫 번역 전에 저작권 동의를 받는다.

동의 저장이 실패하면 모달을 닫지 않는다 — 기록 없이 진행하면 이 모달이 존재하는
이유가 없어진다. 조회 실패는 미동의로 떨어져서 안내를 한 번 더 본다.
```

---

### Task 17: 내 번역 (/mypage)

**Files:**
- Create: `app/mypage/page.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.mypage` 신규)

**Interfaces:**
- Consumes: `fetchHistory`, `HistoryItem`, `useAuth`, `AppNav` (Task 18), `RESULT_RETENTION_DAYS`
- Produces: 라우트 `/mypage`

- [ ] **Step 1: COPY 추가**

```typescript
  mypage: {
    title: '내 번역',
    liteCredits: '라이트 번역권',
    proCredits: '프로 번역권',
    unit: '회',
    historyTitle: '번역 기록',
    retention: (days: number) => `완성된 자막은 ${days}일간 보관해요.`,
    download: '다시 받기',
    expired: '보관 기간 지남',
    empty: '아직 번역한 파일이 없어요.',
    again: '새 파일 번역하기',
    // 용어집은 적용됐을 때만 붙는다 — 켰지만 추출이 실패한 런에는 붙지 않는다.
    meta: (date: string, model: string, glossary: boolean) =>
      `${date} · ${model}${glossary ? ' · 용어집' : ''}`,
  },
```

- [ ] **Step 2: 페이지 작성**

프로토타입 433-464행. 번역권 2카드(모노 숫자) → 보관 안내 한 줄 → 기록 리스트 → CTA.

- 로그인 필수: `user`가 없으면 `/`로 `router.replace`
- `expired: true` 항목은 버튼을 `disabled`로 하고 `expired` 라벨을 보인다
- `downloadUrl`이 null이면(저장 실패한 옛 job) 같은 처리
- 빈 목록이면 `empty` 문구
- 메타 라인은 `COPY.mypage.meta(date, modelLabel, item.options?.glossary === true)`

모델 라벨은 `model === PRO_MODEL ? COPY.settings.proName : COPY.settings.liteName`으로 만든다. 화면에 모델 id를 그대로 노출하지 않는다. 날짜는 `new Date(item.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })`.

- [ ] **Step 3: 검증 + 커밋**

커밋 메시지:

```
내 번역(/mypage)에 번역권 잔여와 번역 기록을 붙인다.

보관 30일이 지난 항목은 객체가 남아 있어도 버튼을 잠근다. 베타에 정리 cron이
없어서 객체가 약속보다 오래 살아 있는데, 약속을 지키는 건 UI다.
```

---

### Task 18: 네비 · 레이아웃 · 결제 진입점 제거

**Files:**
- Create: `app/components/beta/AppNav.tsx`
- Delete: `app/components/simple/StepTracker.tsx`
- Modify: `app/page.tsx`
- Modify: `app/i18n/simpleCopy.ts` (`COPY.nav` 신규, `COPY.steps` 삭제)

**Interfaces:**
- Consumes: `CreditBalances`
- Produces: `<AppNav credits={CreditBalances | null} onHome={() => void} />`

- [ ] **Step 1: COPY 정리**

추가:

```typescript
  nav: {
    history: '내 번역',
    credits: (lite: number, pro: number) => `라이트 ${lite} · 프로 ${pro}`,
    signOut: '로그아웃',
  },
```

`COPY.steps`(8행)를 삭제한다 — `StepTracker`만 쓰던 것이다. `COPY.purchase`는 남긴다 (`page.tsx`의 결제 복귀 쿼리 처리가 아직 쓴다).

- [ ] **Step 2: AppNav 작성**

프로토타입 156-165행. `sticky top-0 z-40 h-14` + `bg-[var(--nav-bg)] backdrop-blur-[20px] backdrop-saturate-[180%]` + 하단 테두리. 좌측 워드마크 배지(`bg-ink text-accent mono`), 우측 "내 번역" 링크 + 번역권 pill(`bg-accent-soft`) + 아바타 원. 번역권 pill과 "내 번역"은 둘 다 `/mypage`로 간다.

- [ ] **Step 3: StepTracker 삭제 + 결제 진입점 제거**

```bash
git rm app/components/simple/StepTracker.tsx
```

`app/page.tsx`에서:
- `StepTracker` import·렌더 제거
- `PurchaseStep` import·렌더 제거, `purchasing` state 제거, 헤더 칩의 `onClick={() => setPurchasing(true)}` 제거 (칩은 `/mypage` 링크가 된다)
- 기존 `header` JSX를 `<AppNav />`로 교체
- `purchaseNotice` 처리는 **남긴다** — 결제 복귀 URL이 아직 유효할 수 있고, 지우면 결제 오픈 때 다시 찾아야 한다

`PurchaseStep.tsx` 파일 자체는 삭제하지 않는다. 아무도 import하지 않으면 eslint가 unused를 잡지 않으므로(파일 단위 미사용은 경고 대상이 아님) 그대로 남는다. 확인:

```bash
grep -rn "PurchaseStep" app/
```

Expected: `PurchaseStep.tsx` 자기 정의만 남는다.

- [ ] **Step 4: 검증 + 커밋**

커밋 메시지:

```
상단 네비를 프로토타입 형태로 바꾸고 결제 진입점을 뺀다.

단계 표시기(StepTracker)는 프로토타입에 없어서 삭제한다. 번역권 pill은 결제창을
열지 않고 내 번역으로 간다 — 베타에 결제창이 없다.

PurchaseStep과 결제 복귀 쿼리 처리는 남긴다. 결제 오픈 때 UI만 다시 붙이면
되고, 지우면 그때 다시 찾아야 한다.
```

---

## Phase 4 — 마무리

### Task 19: 문서 · 버전 · 최종 검증

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/decisions.md`
- Modify: `docs/TODO.md`

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 없음 (문서)

- [ ] **Step 1: CLAUDE.md에 워크트리 규칙 추가**

"## 지시사항" 섹션에 추가한다:

```markdown
- 베타(main)에 포함되지 않는 기능은 `feature/<이름>` 브랜치 + git worktree에서
  개발한다. 워크트리는 리포 밖 형제 디렉터리에 만든다
  (`/Users/jian/projects/zamak-worktrees/<이름>`) — 리포 안에 두면 dev 서버
  워처와 tsc/eslint 글로브가 워크트리를 함께 훑는다.
```

- [ ] **Step 2: README에 설정 절차 추가**

"인증 설정" 섹션 뒤에 베타 마이그레이션 절차를 넣는다: `0004`~`0008`을 순서대로 실행, Supabase Storage에 **비공개** 버킷 `results` 생성. 버킷이 없으면 번역은 되지만 기록이 비어 보인다는 점을 명시한다.

- [ ] **Step 3: docs/decisions.md에 결정 기록**

새 섹션으로 넣는다. 각 항목은 결정과 **근거**를 함께 적는다:
- 번역권 라이트/프로 분리 (프로 원가가 출력 단가로 과금되어 비교 불가)
- 초대 코드·친구 초대 미도입 (Google 계정이 이미 어뷰징 방어, 운영 부담만 늘어남)
- 결제 서버 코드 존치·UI만 제거 (리디자인 중 feature 브랜치를 썩히지 않기 위해)
- 결과물만 보관·원본 미보관 (원본은 사용자 저작물, 보관 근거 없음)
- 보관 30일을 cron 없이 UI가 지킴
- 완료 리포트에 미계측 수치를 넣지 않음

- [ ] **Step 4: docs/TODO.md에 후속 작업 추가**

- 결제 오픈 시 `PurchaseStep`을 새 디자인으로 재연결 (`grant_credits`에 `p_kind` 전달 필요)
- 결과물 보관 만료 정리 cron (현재 UI만 잠금)
- 완료 리포트의 CPS 조정 계측 (지금은 수치가 없어 항목이 빠져 있음)
- 정식 오픈용 마케팅 랜딩 (베타 랜딩이 대체)

- [ ] **Step 5: 최종 전체 검증**

```bash
npx tsc --noEmit && npx eslint app proxy.ts && npx vitest run
```

Expected: 전부 통과.

```bash
grep -rn "COPY\." app/components app/mypage --include=*.tsx | wc -l
grep -rnE '"[가-힣]{2,}' app/components/beta app/mypage --include=*.tsx
```

두 번째 명령의 Expected: 매치 0건 — 컴포넌트에 한글 문구가 하드코딩되지 않았다는 확인 (Global Constraints 첫 항목). 매치가 있으면 `COPY`로 옮긴다.

- [ ] **Step 6: 번역 파이프라인 무변경 확인**

```bash
git diff --stat main -- app/lib/srt.ts app/lib/server/translationService.ts prompts/ app/lib/prompts/
```

Expected: 출력 없음. 변경이 있으면 의도한 것인지 확인하고, 아니면 되돌린다.

- [ ] **Step 7: Browser로 비로그인 경로 최종 확인**

`preview_start` → `/` 확인, `/mypage`로 직접 접근 시 `/`로 돌아가는지 확인, 콘솔 에러 0건 확인, mobile/desktop 뷰포트에서 가로 스크롤 없음 확인.

- [ ] **Step 8: 커밋**

```bash
git add CLAUDE.md README.md docs/decisions.md docs/TODO.md
git commit -m "$(cat <<'EOF'
문서 지도를 베타 리디자인에 맞춰 갱신한다.

feature 워크트리 규칙을 CLAUDE.md에, 마이그레이션 0004~0008과 results 버킷
생성 절차를 README에 적는다. 결정과 근거는 decisions.md에, 결제 UI 재연결과
보관 만료 정리는 TODO.md에.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: 대표 검증 요청 후 main 머지**

로그인 후 화면 전체(업로드→작품→설정→진행→완료, `/mypage`, 소진, 저작권 모달)를 대표가 육안 확인해야 한다. **확인 전에 main으로 머지하지 않는다** — main이 프로덕션이다.

확인 후:

```bash
git checkout main
git merge --no-ff redesign/beta
```

---

## 대표 액션 필요 (순서대로)

1. **Task 1 전**: `scripts/prompt-ab.mts` 미커밋 수정을 커밋할지 버릴지 결정
2. **Task 3 후**: Supabase SQL 에디터에서 `0004_credit_tiers.sql` 실행
3. **Task 4~7 후**: `0005`, `0006`, `0007`, `0008` 실행
4. **Task 6 후**: Supabase Storage에 **비공개** 버킷 `results` 생성
5. **Task 19 후**: 로그인 후 화면 전체 육안 검증 → 승인 시 main 머지
