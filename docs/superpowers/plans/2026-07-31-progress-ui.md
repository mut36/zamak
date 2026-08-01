# 번역 진행 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진행 화면에서 건너뛴 단계를 없애고, 타임코드 검증을 눈에 보이게 만들고, 진행 바를 실측 기반 추정으로 부드럽게 굴린다.

**Architecture:** 벽시계 추정을 순수 함수(`progressEstimate.ts`)로 분리해 `chunk-size-model.md §1`의 실측 파라미터를 코드로 가져온다. 진행 바 값은 `max(실제 청크 착지분, 밴드 끝을 향한 지수 이징)`으로 계산해, 이징이 수학적으로 밴드를 넘지 못하게 만든다. 이징 수식은 순수 함수(`easing.ts`)로 빼고 rAF 훅은 얇은 래퍼로 둔다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, Vitest (node 환경).

## Global Constraints

- **검증 명령**: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens` — 모든 커밋 전에 통과해야 한다.
- **테스트 환경에 jsdom도 @testing-library도 없다.** `vitest.config.ts`는 기본 node 환경이다. **React 훅을 렌더링하는 테스트를 쓰지 말 것.** 기존 패턴(`app/hooks/useWizard.test.ts`)처럼 훅에서 **순수 함수를 export해 그것만** 테스트한다. 새 의존성을 추가하지 않는다.
- **화면 문구 하드코딩 금지** → `app/i18n/simpleCopy.ts`의 `COPY`.
- **설정/상수는 `app/config/constants.ts` 한 곳.**
- 테스트 파일은 소스와 **같은 디렉터리에 `.test.ts`**로 둔다 (기존 패턴).
- 커밋 메시지는 한국어 한 줄 요약 + 왜. 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **dev 서버를 Bash로 띄우지 않는다** — Browser 도구(`preview_start`)를 쓴다. 이미 `:3000`에 떠 있으면 재사용한다.
- 실측 수치 출처는 주석에 문서 경로로 남긴다 (`docs/tuning/chunk-size-model.md §1`, `docs/tuning/experiment-log.md 2026-07-31`).

## 스펙 대비 변경점 (구현 중 확정)

스펙 §7은 `app/hooks/useEasedProgress.test.ts`를 요구했지만 **훅 렌더링 테스트가 불가능**하다(위 Global Constraints). 대신 이징 수식을 `app/lib/easing.ts`로 분리해 순수 함수로 테스트한다. 훅은 rAF 배관만 남아 테스트 가치가 낮다. 이 변경은 Task 3에 반영돼 있다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `app/lib/progressEstimate.ts` | 벽시계 추정 공식 + 모델별 실측 파라미터 | 신규 |
| `app/lib/progressEstimate.test.ts` | 실측 3행 대조 | 신규 |
| `app/lib/easing.ts` | 지수 이징 순수 함수 하나 | 신규 |
| `app/lib/easing.test.ts` | 단조성·천장 불가침 | 신규 |
| `app/hooks/useEasedProgress.ts` | rAF 루프 + reduced-motion 분기 (로직 없음) | 신규 |
| `app/lib/progressStages.ts` | 밴드 정의, `overallPercent`, `stageViews`, `activeStage` | 수정 |
| `app/lib/progressStages.test.ts` | 밴드 재분배·단계 목록 | 신규 |
| `app/config/constants.ts` | `TRANSLATION_ESTIMATE_MS[PRO]`, `MIN_VERIFY_MS` | 수정 |
| `app/config/constants.test.ts` | pro 상수 기대값 | 수정 |
| `app/hooks/useTranslation.ts` | 추정 소스 교체·실측 보정·`finalizing` 이동·최소 노출 | 수정 |
| `app/components/simple/ProgressStep.tsx` | 이징 값 소비, `skipped` 렌더 제거 | 수정 |
| `app/i18n/simpleCopy.ts` | `stageSkipped` 삭제 | 수정 |
| `app/page.tsx` | 설정 화면 ETA를 per-file 추정으로 | 수정 |
| `docs/decisions.md`, `docs/translation-pipeline.md`, `docs/tuning/chunk-size-model.md` | 문서 지도 갱신 | 수정 |

---

### Task 1: 벽시계 추정 순수 함수

**Files:**
- Create: `app/lib/progressEstimate.ts`
- Test: `app/lib/progressEstimate.test.ts`

**Interfaces:**
- Consumes: `app/config/constants.ts`의 `FLASH_MODEL`, `PRO_MODEL`, `SERVER_CONCURRENCY`, `chunkSizeForModel` (모두 기존 export)
- Produces:
  - `estimateChunkMs(model: string, chunkSize: number): number`
  - `estimateRunMsFromChunks(totalChunks: number, chunkSize: number, model: string): number`
  - `estimateRunMsFromBlocks(blocks: number, model: string): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/lib/progressEstimate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FLASH_MODEL, PRO_MODEL } from '../config/constants';
import {
  estimateChunkMs,
  estimateRunMsFromBlocks,
  estimateRunMsFromChunks,
} from './progressEstimate';

/** 실측 대비 허용 오차. 진행 바는 밴드 끝에 점근할 뿐 넘지 못하므로(easing.ts)
 *  이 정도 오차는 바의 정직성을 깨지 않는다 — 빠르면 실제 착지가 밀어올리고
 *  느리면 크롤로 열화된다. */
const TOLERANCE = 0.25;

function within(actualMs: number, measuredSec: number) {
  const ratio = actualMs / 1000 / measuredSec;
  expect(
    Math.abs(ratio - 1),
    `예측 ${(actualMs / 1000).toFixed(1)}s vs 실측 ${measuredSec}s`,
  ).toBeLessThanOrEqual(TOLERANCE);
}

describe('벽시계 추정이 실측 런을 재현한다', () => {
  // docs/tuning/experiment-log.md 2026-07-28
  it('flash 461블록 = 12.0초', () => {
    within(estimateRunMsFromBlocks(461, FLASH_MODEL), 12.0);
  });

  // docs/tuning/experiment-log.md 2026-07-28 — 2웨이브 케이스
  it('flash 1,874블록 = 17.8초', () => {
    within(estimateRunMsFromBlocks(1874, FLASH_MODEL), 17.8);
  });

  // docs/tuning/experiment-log.md 2026-07-31 — 스윕 1회 포함
  it('pro 1,124블록 = 161.4초', () => {
    within(estimateRunMsFromBlocks(1124, PRO_MODEL), 161.4);
  });
});

describe('추정 함수의 경계', () => {
  it('모르는 모델은 flash로 떨어진다', () => {
    expect(estimateRunMsFromBlocks(461, 'some-future-model')).toBe(
      estimateRunMsFromBlocks(461, FLASH_MODEL),
    );
  });

  it('블록이 0이어도 양수를 낸다 — 0으로 나누지 않는다', () => {
    expect(estimateRunMsFromBlocks(0, FLASH_MODEL)).toBeGreaterThan(0);
    expect(estimateRunMsFromChunks(0, 100, FLASH_MODEL)).toBeGreaterThan(0);
  });

  it('pro 청크가 flash 청크보다 오래 걸린다 — θ가 붙기 때문', () => {
    expect(estimateChunkMs(PRO_MODEL, 250)).toBeGreaterThan(
      estimateChunkMs(FLASH_MODEL, 250),
    );
  });

  it('블록이 늘면 추정도 단조 증가한다', () => {
    let prev = 0;
    for (const n of [100, 500, 1000, 2000]) {
      const ms = estimateRunMsFromBlocks(n, FLASH_MODEL);
      expect(ms).toBeGreaterThanOrEqual(prev);
      prev = ms;
    }
  });

  it('청크 수를 아는 경로가 블록 근사와 같은 값을 낸다 (m이 같을 때)', () => {
    // 461블록 / B=100 → m=5
    expect(estimateRunMsFromBlocks(461, FLASH_MODEL)).toBe(
      estimateRunMsFromChunks(5, 100, FLASH_MODEL),
    );
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run app/lib/progressEstimate.test.ts`
Expected: FAIL — `Failed to resolve import "./progressEstimate"`

- [ ] **Step 3: 구현한다**

`app/lib/progressEstimate.ts`:

```ts
import {
  chunkSizeForModel,
  FLASH_MODEL,
  PRO_MODEL,
  SERVER_CONCURRENCY,
} from '../config/constants';

/**
 * 진행 바가 채워질 벽시계 시간의 추정.
 *
 * `docs/tuning/chunk-size-model.md` §1(실측 파라미터)·§2(공식)를 코드로 옮긴 것이다.
 * 그 유도는 지금까지 문서에만 있었고 런타임은 모델별 상수 하나
 * (`TRANSLATION_ESTIMATE_MS`)만 알고 있었다 — 그래서 파일 크기와 무관하게 같은
 * 시간을 약속했다.
 *
 *   D(model, B) = TTFT + B·(t_out + θ) / v      청크 하나
 *   T           = ⌈m/K⌉ · D + OVERHEAD          전체
 *
 * θ(블록당 thinking 토큰)가 flash에서는 0이고 Pro에서는 40이라는 게 두 모델의
 * 구조적 차이다 — Pro 청크 소요의 기울기가 3.5배가 된다.
 *
 * ⚠️ 이 표를 고치면 설정 화면의 "약 N초" 약속과 진행 바가 함께 움직인다.
 */
interface ModelTiming {
  /** 출력 생성 속도 (tok/s). */
  v: number;
  /** 블록당 출력 토큰. */
  tOut: number;
  /** 블록당 thinking 토큰. flash는 0(MINIMAL·LOW 모두), Pro HIGH는 ~40. */
  theta: number;
}

const TIMING: Record<string, ModelTiming> = {
  // chunk-size-model.md §1 실측표 (2026-07-21).
  [FLASH_MODEL]: { v: 220, tOut: 16, theta: 0 },
  // 동 §1 Pro 실측표 (2026-07-28, 14런). v는 95~137 범위의 보수값.
  // θ=40은 2026-07-31 장편 런에서 44.0으로 재확인됐다.
  [PRO_MODEL]: { v: 100, tOut: 16, theta: 40 },
};

/** 첫 토큰까지 지연. chunk-size-model.md §1에서 추정치로 표기된 값. */
const TTFT_MS = 2_000;

/**
 * 청크 웨이브 밖의 고정 비용 — 재조립, 텍스트 규칙 강제, 리딩스피드 보정.
 * flash 실측 잔차에서 뽑았다. 회수 스윕은 조건부라 여기 넣지 않는다 — 스윕
 * 구간은 진행 바에서 verify 밴드가 따로 담당한다.
 */
const OVERHEAD_MS = 3_000;

function timingFor(model: string): ModelTiming {
  return TIMING[model] ?? TIMING[FLASH_MODEL];
}

/** 청크 하나가 걸리는 시간. */
export function estimateChunkMs(model: string, chunkSize: number): number {
  const { v, tOut, theta } = timingFor(model);
  return TTFT_MS + (Math.max(1, chunkSize) * (tOut + theta) * 1000) / v;
}

/**
 * 청크 수가 확정된 뒤의 추정 — 번역이 시작되면 `chunkSrtBlocksAtGaps()`가
 * 실제 개수를 알려주므로 근사를 쓸 이유가 없다.
 */
export function estimateRunMsFromChunks(
  totalChunks: number,
  chunkSize: number,
  model: string,
): number {
  const chunks = Math.max(1, Math.ceil(totalChunks));
  const waves = Math.ceil(chunks / SERVER_CONCURRENCY);
  return waves * estimateChunkMs(model, chunkSize) + OVERHEAD_MS;
}

/**
 * 청크 수를 아직 모를 때의 추정 (설정 화면). 장면 경계에서 자르는
 * `chunkSrtBlocksAtGaps()` 때문에 실제 청크 수는 ⌈N/B⌉와 다를 수 있다.
 */
export function estimateRunMsFromBlocks(blocks: number, model: string): number {
  const chunkSize = chunkSizeForModel(model);
  const m = Math.ceil(Math.max(1, blocks) / chunkSize);
  return estimateRunMsFromChunks(m, chunkSize, model);
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run app/lib/progressEstimate.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 전체 검증 후 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/lib/progressEstimate.ts app/lib/progressEstimate.test.ts
git commit -m "$(cat <<'EOF'
벽시계 추정 공식을 문서에서 코드로 가져온다 — 파일 크기를 보는 추정.

chunk-size-model.md §1·§2의 실측 파라미터가 문서에만 있어서 런타임은 모델별
상수 하나로 모든 파일에 같은 시간을 약속하고 있었다. 실측 3런을 테스트로
고정해 표를 고치면 바로 깨지게 했다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 지수 이징 순수 함수

**Files:**
- Create: `app/lib/easing.ts`
- Test: `app/lib/easing.test.ts`

**Interfaces:**
- Consumes: 없음 (완전 순수)
- Produces: `easeToward(from: number, ceiling: number, elapsedMs: number, expectedMs: number): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/lib/easing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { easeToward } from './easing';

describe('easeToward', () => {
  it('천장에 절대 도달하지 않는다 — 이게 바가 거짓말하지 않는 이유다', () => {
    for (const elapsed of [0, 1_000, 10_000, 1_000_000, 1e12]) {
      expect(easeToward(25, 90, elapsed, 20_000)).toBeLessThan(90);
    }
  });

  it('시작점에서 출발한다', () => {
    expect(easeToward(25, 90, 0, 20_000)).toBe(25);
  });

  it('경과에 대해 단조 증가한다', () => {
    let prev = -1;
    for (let t = 0; t <= 60_000; t += 500) {
      const v = easeToward(25, 90, t, 20_000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('추정 시간에 도달하면 갭의 약 95%를 지난다', () => {
    const v = easeToward(0, 100, 20_000, 20_000);
    expect(v).toBeGreaterThan(94);
    expect(v).toBeLessThan(96);
  });

  it('추정보다 오래 걸리면 기어간다 — 거짓말이 아니라 크롤로 열화', () => {
    const at1x = easeToward(0, 100, 20_000, 20_000);
    const at3x = easeToward(0, 100, 60_000, 20_000);
    expect(at3x - at1x).toBeLessThan(6);
  });

  it('천장이 시작점 이하면 시작점을 그대로 돌려준다', () => {
    expect(easeToward(90, 90, 5_000, 20_000)).toBe(90);
    expect(easeToward(90, 25, 5_000, 20_000)).toBe(90);
  });

  it('추정이 0이나 음수여도 NaN을 내지 않는다', () => {
    expect(easeToward(25, 90, 5_000, 0)).toBe(25);
    expect(easeToward(25, 90, 5_000, -1)).toBe(25);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run app/lib/easing.test.ts`
Expected: FAIL — `Failed to resolve import "./easing"`

- [ ] **Step 3: 구현한다**

`app/lib/easing.ts`:

⚠️ **구현 중 발견·수정된 버그**: 아래 코드는 최초 초안(순수 `1 - Math.exp(...)`)에
안전장치를 추가한 버전이다. `elapsedMs`가 극단적으로 크면(예: 1e12) IEEE 754
배정밀도에서 `Math.exp(-매우_큰_수)`가 정확히 0으로 언더플로해 `progress`가
정확히 1이 되고, 반환값이 `ceiling`과 **정확히 같아진다** — 천장 불가침이라는
이 함수의 핵심 성질을 정확히 그 극단값에서 깬다. Task 2 구현 중 자체 테스트가
이걸 잡아냈다. 고칠 것은 테스트가 아니라 구현이다 — `progress`를 1 미만으로
명시적으로 클램프한다.

```ts
/**
 * 천장을 향한 지수 이징 — **점근할 뿐 절대 도달하지 않는다.**
 *
 * 진행 바가 이 성질에 기대고 있다. 시간으로 움직이는 바는 언제든 실제 진행을
 * 앞질러 거짓말이 될 수 있는데, 지수 이징은 수학적으로 천장을 넘지 못하므로
 * 추정이 짧으면 거짓말 대신 **크롤로 열화**된다. `docs/decisions.md` §2-7이
 * 지키려던 성질이 바로 이것이다.
 *
 * τ는 `expectedMs`에서 갭의 ~95%를 지나도록 잡는다 (1 - e^(-3) ≈ 0.9502).
 *
 * `progress`를 1 미만으로 명시적으로 클램프한다 — 경과 시간이 아주 크면
 * `Math.exp(-x)`가 부동소수점 언더플로로 정확히 0이 되어 progress가 정확히
 * 1이 되고, 반환값이 ceiling과 정확히 같아진다(천장 불가침 위반). 실사용
 * 범위(expectedMs는 초~분 단위)에서는 절대 발동하지 않는 안전장치다.
 */
export function easeToward(
  from: number,
  ceiling: number,
  elapsedMs: number,
  expectedMs: number,
): number {
  if (ceiling <= from) return from;
  if (!(expectedMs > 0)) return from;
  const tau = expectedMs / 3;
  const raw = 1 - Math.exp(-Math.max(0, elapsedMs) / tau);
  const progress = Math.min(raw, 0.999999);
  return from + (ceiling - from) * progress;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run app/lib/easing.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/lib/easing.ts app/lib/easing.test.ts
git commit -m "$(cat <<'EOF'
진행 바가 쓸 지수 이징을 순수 함수로 넣는다 — 천장 불가침이 핵심 성질.

시간으로 움직이는 바는 실제 진행을 앞지를 수 있는데, 지수 이징은 천장에
도달하지 못하므로 추정이 짧아도 거짓말 대신 크롤이 된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 밴드 재분배 + `skipped` 제거

**Files:**
- Modify: `app/lib/progressStages.ts` (전면 교체)
- Test: `app/lib/progressStages.test.ts` (신규)

**Interfaces:**
- Consumes: `app/types/translation.ts`의 `TranslationProgress`
- Produces:
  - `type StageKey = 'context' | 'glossary' | 'translate' | 'verify'`
  - `interface StageView { key: StageKey; state: 'pending' | 'active' | 'done' }` — **`'skipped'`가 사라진다**
  - `bandsFor(glossaryEnabled: boolean): Record<StageKey, [number, number]>`
  - `stageOrder(glossaryEnabled: boolean): StageKey[]`
  - `overallPercent(p, opts: { enrichDone; glossaryEnabled; glossaryDone }): number` (시그니처 불변)
  - `stageViews(percent: number, glossaryEnabled: boolean): StageView[]` (시그니처 불변, 길이가 달라짐)
  - `activeStage(percent: number, glossaryEnabled: boolean): StageKey`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/lib/progressStages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TranslationProgress } from '../types/translation';
import {
  activeStage,
  bandsFor,
  overallPercent,
  stageOrder,
  stageViews,
} from './progressStages';

const BASE: TranslationProgress = {
  stage: 'translating',
  currentChunk: 0,
  totalChunks: 0,
  estimatedRemainingMs: 0,
  lastUpdateTimestamp: 0,
  totalEstimateMs: 0,
  sweepRecovered: 0,
  sweepRemaining: 0,
};

describe('밴드', () => {
  it('글로사리를 끄면 context가 glossary 구간을 흡수한다', () => {
    // 행만 숨기고 밴드를 두면 바가 15%에서 25%로 순간 점프한다.
    expect(bandsFor(false).context).toEqual([0, 25]);
    expect(bandsFor(true).context).toEqual([0, 15]);
    expect(bandsFor(true).glossary).toEqual([15, 25]);
  });

  it('두 경우 모두 0에서 시작해 100에서 끝나고 구멍이 없다', () => {
    for (const on of [true, false]) {
      const bands = bandsFor(on);
      const order = stageOrder(on);
      expect(bands[order[0]][0]).toBe(0);
      expect(bands[order[order.length - 1]][1]).toBe(100);
      for (let i = 1; i < order.length; i += 1) {
        expect(bands[order[i]][0]).toBe(bands[order[i - 1]][1]);
      }
    }
  });
});

describe('stageOrder', () => {
  it('글로사리를 끄면 목록에서 아예 빠진다 — 건너뜀 배지가 아니라 삭제', () => {
    expect(stageOrder(false)).toEqual(['context', 'translate', 'verify']);
    expect(stageOrder(true)).toEqual([
      'context',
      'glossary',
      'translate',
      'verify',
    ]);
  });
});

describe('stageViews', () => {
  it('글로사리 OFF면 3줄만 낸다', () => {
    const views = stageViews(50, false);
    expect(views).toHaveLength(3);
    expect(views.map((v) => v.key)).not.toContain('glossary');
  });

  it("어떤 뷰도 'skipped' 상태를 갖지 않는다", () => {
    for (const on of [true, false]) {
      for (const pct of [0, 10, 20, 50, 95, 100]) {
        for (const v of stageViews(pct, on)) {
          expect(['pending', 'active', 'done']).toContain(v.state);
        }
      }
    }
  });

  it('글로사리 OFF에서 25%면 context는 done, translate가 active', () => {
    const views = stageViews(25, false);
    expect(views.find((v) => v.key === 'context')?.state).toBe('done');
    expect(views.find((v) => v.key === 'translate')?.state).toBe('active');
  });

  it('100%면 전부 done이다', () => {
    for (const on of [true, false]) {
      for (const v of stageViews(100, on)) expect(v.state).toBe('done');
    }
  });
});

describe('overallPercent', () => {
  it('enrich 전에는 context 밴드 안에 머문다', () => {
    const pct = overallPercent(BASE, {
      enrichDone: false,
      glossaryEnabled: false,
      glossaryDone: false,
    });
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(25);
  });

  it('totalChunks가 0이어도 NaN을 내지 않는다', () => {
    const pct = overallPercent(BASE, {
      enrichDone: true,
      glossaryEnabled: false,
      glossaryDone: true,
    });
    expect(Number.isNaN(pct)).toBe(false);
    expect(pct).toBe(25);
  });

  it('청크가 절반 끝나면 translate 밴드의 중간쯤', () => {
    const pct = overallPercent(
      { ...BASE, currentChunk: 5, totalChunks: 10 },
      { enrichDone: true, glossaryEnabled: false, glossaryDone: true },
    );
    expect(pct).toBeCloseTo(57.5, 1);
  });

  it("stage가 'done'이면 100", () => {
    expect(
      overallPercent(
        { ...BASE, stage: 'done' },
        { enrichDone: true, glossaryEnabled: true, glossaryDone: true },
      ),
    ).toBe(100);
  });
});

describe('activeStage', () => {
  it('퍼센트가 속한 밴드의 단계를 돌려준다', () => {
    expect(activeStage(10, false)).toBe('context');
    expect(activeStage(10, true)).toBe('context');
    expect(activeStage(20, true)).toBe('glossary');
    expect(activeStage(20, false)).toBe('context');
    expect(activeStage(50, false)).toBe('translate');
    expect(activeStage(95, false)).toBe('verify');
  });

  it('100%에서도 유효한 단계를 낸다', () => {
    expect(activeStage(100, false)).toBe('verify');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run app/lib/progressStages.test.ts`
Expected: FAIL — `bandsFor is not exported` / `stageOrder is not exported`

- [ ] **Step 3: `progressStages.ts`를 전면 교체한다**

```ts
import type { TranslationProgress } from '../types/translation';

/** 진행 화면이 보여주는 단계. 순서는 stageOrder()가 정한다. */
export type StageKey = 'context' | 'glossary' | 'translate' | 'verify';

export interface StageView {
  key: StageKey;
  state: 'pending' | 'active' | 'done';
}

/**
 * 단계별 퍼센트 밴드.
 *
 * 번역이 25–90을 갖는 건 벽시계의 거의 전부라서다 — 나머지 셋에 같은 폭을 주면
 * 실제로 몇 분 걸리는 단계와 몇 초짜리 단계가 똑같이 느려 보인다.
 *
 * 글로사리를 끄면 그 단계는 화면 목록에서 **사라진다**(예전엔 '건너뜀' 배지로
 * 남았다). 그때 15–25 구간을 context가 흡수하지 않으면 바가 15%에서 25%로
 * 순간 점프한다 — 행 숨김과 밴드 재분배는 같이 가야 한다.
 */
const BANDS_WITH_GLOSSARY: Record<StageKey, [number, number]> = {
  context: [0, 15],
  glossary: [15, 25],
  translate: [25, 90],
  verify: [90, 100],
};

const BANDS_WITHOUT_GLOSSARY: Record<StageKey, [number, number]> = {
  context: [0, 25],
  // 목록에 나오지 않지만 Record 타입을 채우기 위해 빈 구간으로 둔다.
  glossary: [25, 25],
  translate: [25, 90],
  verify: [90, 100],
};

export function bandsFor(
  glossaryEnabled: boolean,
): Record<StageKey, [number, number]> {
  return glossaryEnabled ? BANDS_WITH_GLOSSARY : BANDS_WITHOUT_GLOSSARY;
}

/** 화면에 실제로 그려지는 단계만, 순서대로. */
export function stageOrder(glossaryEnabled: boolean): StageKey[] {
  return glossaryEnabled
    ? ['context', 'glossary', 'translate', 'verify']
    : ['context', 'translate', 'verify'];
}

function lerp(band: [number, number], ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return band[0] + (band[1] - band[0]) * clamped;
}

export function overallPercent(
  p: TranslationProgress,
  opts: { enrichDone: boolean; glossaryEnabled: boolean; glossaryDone: boolean },
): number {
  const bands = bandsFor(opts.glossaryEnabled);
  if (!opts.enrichDone) return lerp(bands.context, 0.5);
  if (opts.glossaryEnabled && !opts.glossaryDone) return lerp(bands.glossary, 0.5);

  if (p.stage === 'recovering' || p.stage === 'finalizing') {
    return lerp(bands.verify, p.stage === 'finalizing' ? 0.8 : 0.3);
  }
  if (p.stage === 'done') return 100;

  // totalChunks는 첫 청크 이벤트 전까지 0이다. 0으로 나누는 대신 밴드 바닥에
  // 고정한다 — 예전엔 NaN%가 그려졌다.
  const ratio = p.totalChunks > 0 ? p.currentChunk / p.totalChunks : 0;
  return lerp(bands.translate, ratio);
}

export function stageViews(
  percent: number,
  glossaryEnabled: boolean,
): StageView[] {
  const bands = bandsFor(glossaryEnabled);
  return stageOrder(glossaryEnabled).map((key) => {
    const [start, end] = bands[key];
    if (percent >= end) return { key, state: 'done' as const };
    if (percent >= start) return { key, state: 'active' as const };
    return { key, state: 'pending' as const };
  });
}

/** 이 퍼센트가 속한 단계. 이징 훅이 천장(밴드 끝)을 고르는 데 쓴다. */
export function activeStage(
  percent: number,
  glossaryEnabled: boolean,
): StageKey {
  const bands = bandsFor(glossaryEnabled);
  const order = stageOrder(glossaryEnabled);
  for (const key of order) {
    if (percent < bands[key][1]) return key;
  }
  return order[order.length - 1];
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run app/lib/progressStages.test.ts`
Expected: PASS (12 tests)

`npx tsc --noEmit`은 이 시점에 **`ProgressStep.tsx`에서 실패한다** (`'skipped'` 비교가 남아 있음). Task 6에서 고친다. 그때까지는 vitest만 통과하면 된다.

- [ ] **Step 5: 커밋 (tsc는 Task 6에서 초록이 된다)**

```bash
npx vitest run app/lib/progressStages.test.ts
git add app/lib/progressStages.ts app/lib/progressStages.test.ts
git commit -m "$(cat <<'EOF'
건너뛴 단계를 배지가 아니라 목록에서 없앤다 — 밴드도 함께 재분배.

행만 숨기고 15-25 밴드를 두면 바가 순간 점프하므로 둘은 같이 가야 한다.
이징 훅이 천장을 고를 수 있게 activeStage()도 함께 낸다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 상수 정리 — pro 실측 반영 + `MIN_VERIFY_MS`

**Files:**
- Modify: `app/config/constants.ts:455-490` (주석 + `TRANSLATION_ESTIMATE_MS`), 그리고 파일 끝에 `MIN_VERIFY_MS` 추가
- Modify: `app/config/constants.test.ts:154-182`

**Interfaces:**
- Consumes: 없음
- Produces: `MIN_VERIFY_MS: number` (2,000), `TRANSLATION_ESTIMATE_MS[PRO_MODEL] === 165_000`

- [ ] **Step 1: 테스트를 먼저 고친다 (실패하게)**

`app/config/constants.test.ts`에서 `expect(estimateTranslationMs(PRO_MODEL)).toBe(180_000);`를 아래로 바꾸고, `MIN_VERIFY_MS` 테스트를 같은 파일 끝에 추가한다:

```ts
    expect(estimateTranslationMs(PRO_MODEL)).toBe(165_000);
```

그리고 import에 `MIN_VERIFY_MS`를 추가한 뒤:

```ts
describe('MIN_VERIFY_MS', () => {
  // 타임코드 검증은 수십 ms에 끝나 한 프레임도 안 보였다. 최소 노출이 없으면
  // 사용자는 검증을 안 했다고 읽는다.
  it('체크가 켜지는 걸 사람이 볼 수 있을 만큼 길다', () => {
    expect(MIN_VERIFY_MS).toBeGreaterThanOrEqual(1_000);
  });

  it('기다림이 부담될 만큼 길지는 않다', () => {
    expect(MIN_VERIFY_MS).toBeLessThanOrEqual(3_000);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run app/config/constants.test.ts`
Expected: FAIL — `expected 180000 to be 165000`, 그리고 `MIN_VERIFY_MS is not exported`

- [ ] **Step 3: 상수를 고친다**

`app/config/constants.ts`의 `TRANSLATION_ESTIMATE_MS` 블록을 아래로 교체한다 (기존 주석 §455-479는 유지하되 마지막 문단을 갱신):

```ts
export const TRANSLATION_ESTIMATE_MS: Record<AllowedModel, number> = {
  [FLASH_MODEL]: 20_000,
  [PRO_MODEL]: 165_000,
};

/**
 * 모델별 벽시계 추정 — **블록 수를 모를 때의 폴백 전용**이다.
 *
 * 블록 수를 알면 `app/lib/progressEstimate.ts`의
 * `estimateRunMsFromBlocks()` / `estimateRunMsFromChunks()`를 쓴다. 그쪽이
 * `docs/tuning/chunk-size-model.md` §1의 실측 파라미터로 파일 크기를 반영한다.
 *
 * pro 165초는 2026-07-31 실측(1,124블록 B=250 HIGH, 총 161.4초 —
 * `docs/tuning/experiment-log.md`)을 올림한 값이다. 이전 180초는
 * `decisions.md` §2-7이 "미측정 자리표시자"라고 명시해 둔 값이었고, 그 주의사항은
 * 이 측정으로 해소됐다. flash 20초는 실측 최악값 17.8초를 덮는 값 그대로다.
 */
export function estimateTranslationMs(model: string): number {
  return model === PRO_MODEL
    ? TRANSLATION_ESTIMATE_MS[PRO_MODEL]
    : TRANSLATION_ESTIMATE_MS[FLASH_MODEL];
}

/**
 * 타임코드 검증 단계의 **최소 노출 시간**.
 *
 * 검증 자체(`enforceTextRules` → `adjustSubtitleTiming` → `buildDownloads`)는
 * 수십 ms에 끝나서, 완료 화면으로 넘어가기 전에 한 프레임도 그려지지 않았다.
 * 사용자에게는 "타임코드 검증을 건너뛴 것"으로 보인다. 고정 대기가 아니라
 * **최소** 보장이다 — 회수 스윕이 더 걸리면 그만큼 더 보여준다.
 */
export const MIN_VERIFY_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_VERIFY_MS,
  2_000,
);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run app/config/constants.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
npx vitest run app/config/constants.test.ts
git add app/config/constants.ts app/config/constants.test.ts
git commit -m "$(cat <<'EOF'
pro 추정 상수에서 자리표시자 딱지를 뗀다 — 180초 → 165초(실측 161.4초).

decisions.md §2-7이 남겨둔 "pro 3분은 미측정"이 07-31 장편 실측으로 해소됐다.
검증 단계 최소 노출 상수도 여기 함께 둔다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: rAF 이징 훅

**Files:**
- Create: `app/hooks/useEasedProgress.ts`

**Interfaces:**
- Consumes: `app/lib/easing.ts`의 `easeToward`
- Produces: `useEasedProgress(input: { floor: number; bandEnd: number; expectedMs: number; snap?: boolean }): number`

테스트 없음 — Global Constraints대로 훅 렌더링 테스트가 불가능하고, 로직은 Task 2에서 전부 커버됐다. 이 파일은 rAF 배관과 reduced-motion 분기만 갖는다.

- [ ] **Step 1: 구현한다**

`app/hooks/useEasedProgress.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { easeToward } from '../lib/easing';

/** done 스냅의 이징 시간 — τ≈150ms가 되도록 3τ로 준다. */
const SNAP_MS = 450;

/** 스냅이 이 위로 오면 100으로 붙인다. 지수 이징은 천장에 닿지 못하므로,
 *  바가 실제로 가득 차려면 마지막 한 뼘은 명시적으로 채워야 한다. */
const SNAP_CLAMP_AT = 99.5;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 진행 바가 그릴 퍼센트.
 *
 *   값 = max( floor(실제 청크 착지분), 밴드 끝을 향한 지수 이징 )
 *
 * 이징이 없으면 바는 계단으로 튄다. Pro는 특히 나쁘다 — 청크 5개가 한 웨이브로
 * 동시 실행돼서 142초 동안 착지 이벤트가 0건이고, 바가 25%에 멈춰 있는다.
 * 반대로 이징만 쓰면 실제 진행을 앞질러 거짓말이 된다. 둘의 max가 답이다:
 * 지수 이징은 밴드 끝에 **도달하지 못하므로** 앞지를 수 없고, 실제 착지는
 * 언제든 바닥을 밀어올릴 수 있다.
 *
 * 값은 단조 증가한다 — 밴드가 바뀌어도 뒤로 가지 않는다.
 */
export function useEasedProgress(input: {
  /** 실제 진행에서 온 바닥 (overallPercent). */
  floor: number;
  /** 점근 천장 — 현재 활성 밴드의 끝. */
  bandEnd: number;
  /** 이 밴드를 지나는 데 걸릴 추정 시간. */
  expectedMs: number;
  /** 번역이 끝났다 — 100%까지 빠르게 당긴다. */
  snap?: boolean;
}): number {
  const { floor, bandEnd, expectedMs, snap = false } = input;
  const [value, setValue] = useState(floor);
  /** 단조성 보장용. 렌더 사이에 살아남아야 해서 ref다. */
  const highWater = useRef(floor);
  /** 이징의 기준점 — floor가 움직일 때마다 거기서 다시 출발한다. */
  const anchor = useRef<{ at: number; from: number }>({ at: 0, from: floor });

  useEffect(() => {
    anchor.current = {
      at: performance.now(),
      from: Math.max(highWater.current, floor),
    };
  }, [floor, bandEnd, snap]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // 모션을 줄여달라고 한 사용자에겐 계단이 정답이다 — 실제 값만 그린다.
      const next = Math.max(highWater.current, snap ? 100 : floor);
      highWater.current = next;
      setValue(next);
      return;
    }

    let raf = 0;
    const tick = () => {
      const { at, from } = anchor.current;
      let next = Math.max(
        highWater.current,
        floor,
        easeToward(
          from,
          snap ? 100 : bandEnd,
          performance.now() - at,
          snap ? SNAP_MS : expectedMs,
        ),
      );
      if (snap && next > SNAP_CLAMP_AT) next = 100;
      highWater.current = next;
      setValue(next);
      if (!(snap && next >= 100)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [floor, bandEnd, expectedMs, snap]);

  return value;
}
```

- [ ] **Step 2: 타입과 린트를 확인한다**

Run: `npx tsc --noEmit 2>&1 | grep -v ProgressStep`
Expected: `useEasedProgress.ts` 관련 에러 없음 (ProgressStep은 Task 6까지 빨간 상태)

Run: `npx eslint app/hooks/useEasedProgress.ts`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
npx eslint app/hooks/useEasedProgress.ts
git add app/hooks/useEasedProgress.ts
git commit -m "$(cat <<'EOF'
진행 바용 rAF 이징 훅 — max(실제 착지, 밴드 끝 점근 이징).

Pro는 청크 전부가 한 웨이브라 142초 동안 착지 이벤트가 0건이다. 이징 없이는
바가 25%에 멈춰 있고, 이징만으로는 실제 진행을 앞지른다. 둘의 max가 답이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `ProgressStep` — 이징 소비 + `skipped` 렌더 제거

**Files:**
- Modify: `app/components/simple/ProgressStep.tsx` (전면 교체)
- Modify: `app/i18n/simpleCopy.ts:451` (`stageSkipped` 삭제)

**Interfaces:**
- Consumes: Task 1의 `estimateRunMsFromChunks`, Task 3의 `activeStage`/`bandsFor`/`overallPercent`/`stageViews`, Task 4의 `MIN_VERIFY_MS`/`GLOSSARY_WAIT_MS`, Task 5의 `useEasedProgress`
- Produces: 없음 (화면 끝단)

- [ ] **Step 1: `simpleCopy.ts`에서 '건너뜀'을 삭제한다**

`app/i18n/simpleCopy.ts`에서 이 줄을 지운다:

```ts
    stageSkipped: '건너뜀',
```

- [ ] **Step 2: `ProgressStep.tsx`를 교체한다**

`app/components/simple/ProgressStep.tsx`에서 상단 import와 본문 앞부분(1–81줄)을 아래로 바꾼다. `card` 이하 체크리스트 렌더는 `'skipped'` 분기만 걷어내고 나머지는 유지한다.

```tsx
'use client';

import type { TranslationProgress } from '../../types/translation';
import { StepBreadcrumb } from '../StepBreadcrumb';
import { COPY } from '../../i18n/simpleCopy';
import {
  DEFAULT_MODEL,
  GLOSSARY_WAIT_MS,
  MIN_VERIFY_MS,
  estimateTranslationMs,
} from '../../config/constants';
import { useEasedProgress } from '../../hooks/useEasedProgress';
import {
  activeStage,
  bandsFor,
  overallPercent,
  stageViews,
  type StageKey,
} from '../../lib/progressStages';

interface ProgressStepProps {
  progress: TranslationProgress;
  /** Total subtitle blocks in the source (for the "N / total줄" readout). */
  totalLines: number;
  onCancel: () => void;
  /** Work identification (enrich / manual entry) is always settled before
   *  handleTranslate can even be called — see ProgressStep's own usage site
   *  for why this is passed as a constant rather than tracked state. */
  enrichDone: boolean;
  /** Whether the cast-sheet (glossary) toggle is on for this run. */
  glossaryEnabled: boolean;
  /** False only while the cast-sheet extraction is still in flight. */
  glossaryDone: boolean;
}

const c = COPY.progress;

/** enrich에는 대기 상수가 없다 — 이징이 기댈 수 있는 최소한의 값. */
const CONTEXT_EXPECTED_MS = 3_000;

/**
 * Flat progress bar + stage checklist (context → [glossary] → translate →
 * verify).
 *
 * 바가 그리는 값은 `max(실제 청크 착지분, 밴드 끝을 향한 지수 이징)`이다
 * (`useEasedProgress`). 실제 진행만 쓰면 계단으로 튀고 — Pro는 한 웨이브라
 * 142초 동안 아예 멈춰 있다 — 시간만 쓰면 거짓말이 된다.
 *
 * 글로사리를 끈 런에서는 그 단계가 목록에서 사라지고, 15–25 구간은 context가
 * 흡수한다 (`bandsFor`).
 */
export function ProgressStep({
  progress,
  totalLines,
  onCancel,
  enrichDone,
  glossaryEnabled,
  glossaryDone,
}: ProgressStepProps) {
  const floor = overallPercent(progress, {
    enrichDone,
    glossaryEnabled,
    glossaryDone,
  });
  const stage = activeStage(floor, glossaryEnabled);
  const bands = bandsFor(glossaryEnabled);

  // 밴드마다 이징이 기댈 시간이 다르다. translate는 실측 보정을 거친
  // estimatedRemainingMs(useTranslation), 나머지는 그 단계의 대기 상수.
  const expectedMs: Record<StageKey, number> = {
    context: CONTEXT_EXPECTED_MS,
    glossary: GLOSSARY_WAIT_MS,
    translate:
      progress.estimatedRemainingMs ||
      progress.totalEstimateMs ||
      estimateTranslationMs(DEFAULT_MODEL),
    verify: MIN_VERIFY_MS,
  };

  const percent = useEasedProgress({
    floor,
    bandEnd: bands[stage][1],
    expectedMs: expectedMs[stage],
    snap: progress.stage === 'done',
  });

  const views = stageViews(percent, glossaryEnabled);
  const title = c.stages[stage];

  // expectedMs.translate는 이미 **남은** 시간이다(useTranslation이 실측 보정해
  // 넣는다). 여기서 (1 - percent/100)을 다시 곱하면 이중으로 깎인다.
  const remainingSec =
    percent >= 100 ? 0 : Math.max(1, Math.round(expectedMs.translate / 1000));
  const processedLines = Math.round((percent / 100) * totalLines);

  return (
    <div className='animate-zslide flex flex-col items-center w-full max-w-[520px] mx-auto'>
      <StepBreadcrumb current='translate' className='mb-6' />
      <div className='head text-center'>
        <h1 className='!text-h1-mini'>{title}</h1>
      </div>

      <div className='mono text-fineprint text-tertiary mt-1'>
        {c.pct(percent, remainingSec)}
      </div>

      <div className='w-full h-[6px] rounded-full bg-track overflow-hidden mt-4 mb-4'>
        {/* rAF가 매 프레임 값을 주므로 CSS 트랜지션을 걸지 않는다 — 이중 이징이
            되면 바가 늘어지고 실제 착지 반영이 늦어진다. */}
        <div
          className='h-full rounded-full bg-ink-strong'
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      <div className='card flex flex-col gap-[14px] w-full p-[24px_28px]'>
        {views.map((view) => (
          <div
            key={view.key}
            className={`flex items-center gap-3${
              view.state === 'pending' ? ' opacity-40' : ''
            }`}
          >
            {view.state === 'done' ? (
              <span
                className='flex items-center justify-center w-5 h-5 rounded-[5px] text-white text-mono-step font-bold shrink-0'
                style={{ background: 'var(--success)' }}
              >
                ✓
              </span>
            ) : (
              <span
                className={`w-5 h-5 rounded-[5px] shrink-0${
                  view.state === 'active' ? ' animate-zbreathe' : ''
                }`}
                style={{
                  background:
                    view.state === 'active' ? 'var(--ink-strong)' : 'transparent',
                  border:
                    view.state === 'active'
                      ? 'none'
                      : '1.5px solid var(--border-step)',
                }}
              />
            )}
            <span className='text-body text-nav'>{c.stages[view.key]}</span>
          </div>
        ))}
      </div>

      {/* While the sweep runs, the checklist is already pinned on "verify" —
          swap the readout for the one pair of numbers that is still moving,
          so the extra wait doesn't look like a hang. */}
      {progress.stage === 'recovering' ? (
        <div className='psub mono mt-4'>
          {c.recoveringDetail(progress.sweepRecovered, progress.sweepRemaining)}
        </div>
      ) : (
        totalLines > 0 && (
          <div className='psub mono mt-4'>
            {c.remaining(processedLines, totalLines, remainingSec)}
          </div>
        )
      )}

      <p className='text-caption text-nav text-center mt-6'>{c.reassure}</p>

      <button type='button' className='btn btn-ghost mt-5' onClick={onCancel}>
        {c.cancel}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 전체 타입·린트·테스트가 초록인지 확인한다**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run`
Expected: 전부 통과. Task 3에서 빨갛던 `ProgressStep`이 여기서 초록이 된다.

- [ ] **Step 4: 브라우저로 눈으로 확인한다**

`preview_start`로 dev 서버를 열고(이미 `:3000`에 떠 있으면 `preview_start {url:"http://localhost:3000/dev/preview"}`로 재사용) 우하단 '화면' → `progress`를 고른다.

확인 항목:
- 목록이 **4줄**이다 (하네스 기본이 글로사리 ON). `PreviewHarness`의 `castSheetOn`을 끄면 **3줄**이 되고 '건너뜀' 배지가 없다.
- 바가 계단이 아니라 부드럽게 오른다.
- 콘솔 에러 0건 (`read_console_messages`).
- `resize_window` mobile(375px)에서 가로 스크롤이 없다.

- [ ] **Step 5: 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/components/simple/ProgressStep.tsx app/i18n/simpleCopy.ts
git commit -m "$(cat <<'EOF'
진행 바를 이징 값으로 그리고 '건너뜀' 배지를 없앤다.

CSS 트랜지션은 걷어냈다 — rAF가 매 프레임 값을 주므로 이중 이징이 되면
바가 늘어지고 실제 청크 착지 반영이 늦어진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `useTranslation` — 추정 소스 교체 + 실측 보정 + 검증 최소 노출

**Files:**
- Modify: `app/hooks/useTranslation.ts` (import, ~296, ~373-379, ~465, ~504, ~561)

**Interfaces:**
- Consumes: Task 1의 `estimateRunMsFromChunks`, Task 4의 `MIN_VERIFY_MS`
- Produces: 없음 (`TranslationProgress`의 필드 의미만 바뀐다 — `totalEstimateMs`가 파일별 값이 되고 `estimatedRemainingMs`가 실측 보정을 거친다)

- [ ] **Step 1: import를 고친다**

`app/config/constants`에서 가져오는 목록에 `MIN_VERIFY_MS`를 추가하고, `estimateTranslationMs` import를 지운 뒤 새 모듈을 추가한다:

```ts
import { estimateRunMsFromChunks } from '../lib/progressEstimate';
```

- [ ] **Step 2: 파일 상단(`IDLE_PROGRESS` 정의 근처)에 취소를 존중하는 대기를 추가한다**

```ts
/**
 * `ms`만큼 기다리되, 사용자가 취소하면 즉시 깨어난다. 검증 단계 최소 노출이
 * 취소를 삼키면 안 되기 때문에 필요하다.
 */
function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
```

- [ ] **Step 3: 추정 소스를 파일별 계산으로 바꾼다 (~296줄)**

```ts
      // 파일 크기를 반영한 추정. 청크 수는 chunkSrtBlocksAtGaps()가 방금
      // 확정했으므로 블록 근사가 아니라 실제 개수를 쓴다.
      // (docs/tuning/chunk-size-model.md §1·§2 → app/lib/progressEstimate.ts)
      const totalEstimateMs = estimateRunMsFromChunks(
        totalChunks,
        chunkSize,
        model,
      );
      const translateStartedAt = Date.now();
```

- [ ] **Step 4: `onCompleted`에서 실측 보정을 한다 (~373줄)**

```ts
        onCompleted: (completed) => {
          // 관측 처리율로 남은 시간을 다시 재고, 모델 예측과 섞는다. 가중치는
          // 한 웨이브(=concurrency)가 착지하면 1이 된다 — 그때부터는 이번 런의
          // 실제 속도가 모델 예측보다 낫다. 웨이브가 하나뿐인 런(Pro)은 보정
          // 기회가 없지만, 거기서는 모델 예측이 이미 정확하다.
          const modelRemaining = totalEstimateMs * (1 - completed / totalChunks);
          const elapsed = Date.now() - translateStartedAt;
          const measuredRemaining =
            completed > 0
              ? (elapsed * (totalChunks - completed)) / completed
              : modelRemaining;
          const w = Math.min(
            1,
            completed / Math.max(1, Math.min(totalChunks, concurrency)),
          );
          setTranslationProgress((prev) => ({
            ...prev,
            currentChunk: completed,
            estimatedRemainingMs:
              (1 - w) * modelRemaining + w * measuredRemaining,
            lastUpdateTimestamp: Date.now(),
          }));
        },
```

- [ ] **Step 5: `finalizing`을 실제 검증 작업 **앞으로** 옮긴다**

현재 `stage: 'finalizing'` 세팅은 `adjustSubtitleTiming`/`buildDownloads` **뒤**(~504줄)에 있다. 그 블록을 지우고, 대신 `enforceTextRules` **바로 앞**(~465줄, `if (controller.signal.aborted)` 블록 직후)에 아래를 넣는다:

```ts
      // 검증 표시는 실제 검증 앞에 선다. 예전엔 이 블록이 작업 뒤에 있었고,
      // 바로 다음 줄의 setTranslationProgress({stage:'done'})와 같은 tick에
      // 묶여서 React가 배치해 버렸다 — verify 단계가 한 프레임도 그려지지
      // 않았고, 사용자에겐 타임코드 검증을 건너뛴 것으로 보였다.
      const verifyStartedAt = Date.now();
      setTranslationProgress((prev) => ({
        ...prev,
        stage: 'finalizing',
        currentChunk: totalChunks,
        totalChunks,
        estimatedRemainingMs: 0,
      }));
```

- [ ] **Step 6: `done` 앞에 최소 노출을 넣는다 (~561줄)**

`setTranslationProgress({ stage: 'done', ... })` 바로 앞에 넣는다:

```ts
      // 검증이 눈에 보이도록 최소 시간을 채운다. 고정 대기가 아니라 최소
      // 보장이다 — 스윕이 더 걸렸으면 이미 지나가서 0이 된다.
      await sleepUnlessAborted(
        MIN_VERIFY_MS - (Date.now() - verifyStartedAt),
        controller.signal,
      );
      if (controller.signal.aborted) {
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }
```

- [ ] **Step 7: 검증하고 실제 런으로 확인한다**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run`
Expected: 전부 통과

그다음 dev 서버에서 **실제 파일 하나를 끝까지 번역**한다 (`/dev/preview`가 아니라 `/`). 확인 항목:
- '타임코드를 검증하는 중'의 체크가 **켜지는 게 보인다** (최소 2초).
- 그 2초 동안 바가 90 → 100으로 찬다.
- 완료 화면으로 넘어간다.
- 번역 중 '취소'를 누르면 즉시 설정 화면으로 돌아간다 (2초를 기다리지 않는다).

- [ ] **Step 8: 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/hooks/useTranslation.ts
git commit -m "$(cat <<'EOF'
타임코드 검증이 한 프레임도 안 그려지던 버그를 고친다 — 표시를 작업 앞으로.

finalizing과 done이 같은 tick에 있어서 React가 배치했다. 표시를 실제 검증
앞으로 옮기고 최소 노출 2초를 보장한다(취소는 즉시 깨운다). 진행 추정도
파일별 계산 + 관측 처리율 보정으로 바꿨다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 설정 화면 ETA를 같은 식으로 통일

**Files:**
- Modify: `app/page.tsx:21` (import), `app/page.tsx:126-133` (`etaSeconds`)

**Interfaces:**
- Consumes: Task 1의 `estimateRunMsFromBlocks`
- Produces: 없음

- [ ] **Step 1: import를 고친다**

`app/page.tsx:21`에서 `estimateTranslationMs`를 빼고 `GLOSSARY_WAIT_MS`만 남긴 뒤, 새 import를 추가한다:

```ts
import { GLOSSARY_WAIT_MS } from './config/constants';
import { estimateRunMsFromBlocks } from './lib/progressEstimate';
```

- [ ] **Step 2: `etaSeconds`를 파일별 추정으로 바꾼다**

```tsx
  // 설정 화면 하단 바의 ETA 약속. 진행 바가 채워질 때 쓰는 것과 **같은 식**을
  // 쓴다 — 업로드 시점에 totalLines가 이미 잡혀 있으므로 파일 크기를 반영할 수
  // 있다. decisions.md §2-7이 걱정했던 "같은 화면에서 카피와 링이 다른 시간을
  // 말한다"가 여기서 해소된다: 두 숫자가 한 함수에서 나온다.
  const etaSeconds = Math.round(
    (estimateRunMsFromBlocks(totalLines, model) +
      (castSheet.enabled ? GLOSSARY_WAIT_MS : 0)) /
      1000,
  );
```

- [ ] **Step 3: 검증하고 눈으로 확인한다**

Run: `npx tsc --noEmit && npx eslint app && npx vitest run`
Expected: 전부 통과

dev 서버에서 `/dev/preview` → `settings`를 열어 하단 바의 초가 그럴듯한지 본다. 그다음 실제 `/`에서 파일을 올려 설정 화면의 초와, 번역을 시작한 뒤 진행 화면의 초가 **같은 값에서 출발**하는지 본다.

- [ ] **Step 4: 커밋**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run
git add app/page.tsx
git commit -m "$(cat <<'EOF'
설정 화면 ETA와 진행 바가 같은 식을 쓰게 한다.

업로드 시점에 totalLines가 이미 있으므로 설정 화면도 파일 크기를 반영할 수
있다. §2-7이 걱정했던 "카피와 링이 다른 시간" 문제가 두 숫자를 한 함수에서
뽑는 것으로 해소된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 문서 지도 갱신

**Files:**
- Modify: `docs/decisions.md` (파일 끝, §6-4 뒤에 §6-5로 추가)
- Modify: `docs/translation-pipeline.md:260-261`, `docs/translation-pipeline.md:553`
- Modify: `docs/tuning/chunk-size-model.md` (§1 "실측 파라미터" 헤딩 바로 아래)

CLAUDE.md의 '문서 지도' 규칙상 `app/config/constants.ts`를 건드렸으므로 필수다.

- [ ] **Step 1: `decisions.md` 끝에 되뒤집기 항목을 쓴다**

현재 마지막 항목이 `### 6-4.`이므로 그 뒤에 `### 6-5.`로 추가한다:

```markdown
### 6-5. ~~진행 추정 = 모델별 고정값~~ → **파일별 실측 계산 + 지수 이징** (2026-07-31)

§2-7에서 실측 생성률 계산을 모델별 고정값으로 되돌렸다. 이번에 **다시 뒤집는다.**

**되돌렸던 이유와, 지금은 왜 유효하지 않은가**
- §2-7의 근거는 "랜딩 카피가 시간 하나를 약속하는데 파일마다 다른 시간을 말하면
  같은 화면에서 모순"이었다. 그런데 진행 화면은 이미 `COPY.progress.pct`로
  **초 단위 숫자를 그리고 있었다** — 파일별로 다른 숫자를 말하는 건 이미 하고
  있었던 셈이다.
- 오히려 설정 화면(`page.tsx`)과 진행 바가 **다른 근거**를 쓰고 있던 게 문제였다.
  이번에 둘 다 `estimateRunMsFromBlocks`/`FromChunks` 한 함수에서 뽑게 했다.
- §2-7이 "필요해지면 §5-7의 유도가 그대로 남아 있으니 되살리면 된다"고 명시해
  뒀다. 그 조건이 왔다.

**결정**: `docs/tuning/chunk-size-model.md` §1·§2의 실측 파라미터와 공식을
`app/lib/progressEstimate.ts`로 옮긴다. `TRANSLATION_ESTIMATE_MS`는 **블록 수를
모를 때의 폴백 전용**으로 격하하고, pro는 180초(미측정 자리표시자) → **165초**
(2026-07-31 실측 161.4초)로 고친다.

**§2-7의 안전성은 이징이 대신 지킨다.** 바는
`max(실제 청크 착지분, 밴드 끝을 향한 지수 이징)`으로 그린다. 지수 이징은 천장에
**도달하지 못하므로** 추정이 짧아도 거짓말이 아니라 크롤로 열화된다 — §2-7이
고정값을 써도 된다고 본 근거가 바로 그 성질이었고, 그건 그대로 살아 있다.

**Pro가 이 변경을 강제했다.** `PRO_CHUNK_SIZE=250`·`SERVER_CONCURRENCY=16`이라
1,124블록 파일은 청크 5개가 전부 한 웨이브다 — `onCompleted`가 142초 동안 한 번도
불리지 않는다. 청크 착지에만 기대는 바는 그동안 25%에 멈춰 있다. "다음 청크 착지를
천장으로 삼는" 안을 설계 중에 기각한 것도 같은 이유다.

**함께 고친 것**
- 글로사리를 끄면 그 단계가 '건너뜀' 배지가 아니라 **목록에서 사라진다**. 15–25
  밴드는 context가 흡수한다 — 행만 숨기면 바가 순간 점프한다.
- **타임코드 검증이 한 프레임도 안 그려지던 버그.** `useTranslation`에서
  `stage:'finalizing'`과 `stage:'done'`이 같은 tick에 있어 React가 배치했다.
  표시를 실제 검증 작업 앞으로 옮기고 `MIN_VERIFY_MS`(2초) **최소 노출**을
  보장한다. 고정 대기가 아니라 최소 보장이며, 취소는 즉시 깨운다. 하지 않은 일을
  했다고 하는 게 아니라 한 일을 볼 수 있게 만드는 것이다.

**주의할 점**
- `chunk-size-model.md` §1의 v·t_out·θ를 고치면 **UI 추정이 함께 움직인다.**
  이제 그 표는 문서가 아니라 런타임 파라미터다.
- 2웨이브 flash 런은 `⌈m/K⌉` 때문에 ~21% 과대 추정된다. 실측 보정이 첫 웨이브
  착지 후 잡지만, 웨이브 경계가 더 중요해지면 모델 자체를 손봐야 한다.
- 랜딩 카피 "12초"는 그대로다. 파일 크기를 명시한 문구라 모순되지 않는다.
  §2-7에 남아 있는 "pro를 전면에 내세우면 문구를 모델별로 갈라야 한다"는 여전히
  미해결이다.

설계 문서: `docs/superpowers/specs/2026-07-31-progress-ui-design.md`
```

- [ ] **Step 2: `translation-pipeline.md`의 두 지점을 갱신한다**

`:260-261`은 지금 **두 번 낡았다** — "flash 30초"는 이미 20초로 바뀐 값이고,
"파일 크기 무관"은 이번 변경으로 거짓이 된다. 아래로 교체한다:

```markdown
- **진행 바**: 채워지는 속도는 `app/lib/progressEstimate.ts`가 파일 크기(청크 수)와
  모델로 계산한다(`chunk-size-model.md` §1 실측 파라미터). `constants.ts`
  `TRANSLATION_ESTIMATE_MS`(flash 20초 / pro 165초)는 블록 수를 모를 때의 폴백뿐이다.
  바 자체는 `ProgressStep.tsx` + `useEasedProgress.ts` — `max(실제 청크 착지분,
  밴드 끝을 향한 지수 이징)`이라 천장을 넘지 못한다. 밴드는 `progressStages.ts`.
```

`:553`의 "증상→고칠 파일" 표 행도 교체한다:

```markdown
| 진행 바가 너무 빨리 차서 끝에서 오래 기다림(또는 그 반대) | `app/lib/progressEstimate.ts`의 v·t_out·θ(출처는 `tuning/chunk-size-model.md` §1), 이징 곡선은 `app/lib/easing.ts` — §6 |
| 진행 바가 계단으로 튐 / 한참 멈춰 있음 | `useEasedProgress.ts`(rAF·reduced-motion), 밴드는 `progressStages.ts` |
| 타임코드 검증 단계가 안 보이고 완료로 넘어감 | `constants.ts` `MIN_VERIFY_MS`, 표시 순서는 `useTranslation.ts`의 `finalizing` 세팅 위치 |
```

- [ ] **Step 3: `chunk-size-model.md` §1 헤딩 아래에 경고를 넣는다**

`## 1. 실측 파라미터 (2026-07-21)` 바로 아래, 본문 시작 전에 넣는다:

```markdown
> ⚠️ **이 표는 이제 런타임 코드다.** `app/lib/progressEstimate.ts`가 v·t_out·θ를
> 그대로 읽어 진행 바와 설정 화면 ETA를 계산한다. 값을 고치면 UI가 함께 움직이고
> `app/lib/progressEstimate.test.ts`의 실측 대조가 깨질 수 있다.
```

- [ ] **Step 4: 커밋**

```bash
git add docs/decisions.md docs/translation-pipeline.md docs/tuning/chunk-size-model.md
git commit -m "$(cat <<'EOF'
§2-7(모델별 고정 추정)을 되뒤집은 근거를 문서 지도에 남긴다.

되돌렸던 이유가 왜 지금은 유효하지 않은지, 그리고 §2-7이 지키려던 안전성을
지수 이징이 어떻게 대신 지키는지를 적었다. chunk-size-model §1 표가 이제
런타임 파라미터라는 경고도 함께.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 최종 확인

- [ ] `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens` 전부 통과
- [ ] `/dev/preview` → `progress`: 글로사리 ON 4줄 / OFF 3줄, '건너뜀' 없음, 바가 부드러움, 콘솔 0건
- [ ] `/dev/preview` → `progress:recovering`: 스윕 문구가 그대로 나온다
- [ ] 실제 `/`에서 파일 하나 완주: 검증 체크가 보이고, 2초 뒤 완료 화면
- [ ] 번역 중 취소: 2초 기다리지 않고 즉시 설정 화면
- [ ] mobile(375px) 가로 스크롤 없음
