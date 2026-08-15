# 진행 바 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진행 바가 0%에서 시작해 실제 경과 시간에 비례해 오르고, 청크 착지가 몰려도 점프 대신 미끄러지게 만든다.

**Architecture:** 순수 함수 3개(`easeToward` 곡선, `catchupValue`, weight 기반 밴드 계산)를 먼저 TDD로 만들고, 훅(`useEasedProgress`)과 컴포넌트(`ProgressStep`)는 그것들을 배선만 한다. 계산 로직은 컴포넌트에 두지 않는다 — 이 리포는 React 테스트 라이브러리가 없어서 순수 함수로 뽑아야 테스트가 된다(`app/hooks/useWizard.test.ts`가 같은 패턴이다).

**Tech Stack:** TypeScript, Next.js(App Router), React 훅, Vitest. 새 의존성 없음.

설계 문서: `docs/superpowers/specs/2026-08-15-progress-ui-v2-design.md`

## Global Constraints

- **천장 불가침**: `easeToward`는 어떤 입력에도 `ceiling`에 도달하면 안 된다. 진행 바가 거짓말하지 않는 근거이며 `docs/decisions.md` §6-5가 지킨 성질이다.
- **단조 증가**: 바가 그리는 값은 절대 뒤로 가지 않는다.
- **화면 문구 하드코딩 금지** → `app/i18n/simpleCopy.ts`의 `COPY`. (이 계획은 새 문구를 추가하지 않는다.)
- **설정/상수는 `app/config/constants.ts` 한 곳.** 단, 진행 화면 전용 튜닝값(`K`, `CATCHUP_MS`, verify 폭 클램프)은 지금 `CONTEXT_EXPECTED_MS`/`RECOVERY_EXPECTED_MS`가 그렇듯 사용처 모듈 상단에 둔다 — env로 노출할 값이 아니다.
- **검증 명령**: `npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens`
- 번역 파이프라인은 건드리지 않는다 → `docs/translation-pipeline.md` 갱신 대상 아님.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `app/lib/easing.ts` | 수정 | 시간 → 0~1 진행률. `easeToward`(곡선) + `catchupValue`(점프 흡수). 순수 |
| `app/lib/easing.test.ts` | 수정 | 위 두 함수의 성질 테스트 |
| `app/lib/progressStages.ts` | 수정 | weight → 밴드, 밴드 → 단계 뷰. 순수 |
| `app/lib/progressStages.test.ts` | 수정 | 밴드 계산·클램프·연속성 테스트 |
| `app/hooks/useEasedProgress.ts` | 수정 | 프레임별 렌더 값. 단조성 소유. 계산은 `easing.ts`에 위임 |
| `app/components/simple/ProgressStep.tsx` | 수정 | 배선 + 밴드 얼림. 계산 로직 없음 |
| `app/page.tsx` | 수정 | `model` prop 전달 |
| `app/dev/preview/PreviewHarness.tsx` | 수정 | `model` prop 전달 |
| `docs/decisions.md` | 수정 | §6-5를 잇는 항목 |

---

## Task 1: 곡선 교체 — 추정까지 선형, 초과분만 크롤

**Files:**
- Modify: `app/lib/easing.ts:16-28`
- Test: `app/lib/easing.test.ts`

**Interfaces:**
- Consumes: 없음 (시작 지점)
- Produces: `easeToward(from: number, ceiling: number, elapsedMs: number, expectedMs: number): number` — 시그니처 무변경. 내부 식만 바뀐다. Task 4가 그대로 호출한다.

**왜:** 현재 식 `1 − e^(−3t/D)`는 t=0에서 가장 빠르다. flash 20초 런에서 2초 만에 갭의 26%를 지나간다. 이것이 "시작하자마자 사십몇 프로"의 원인이다.

- [ ] **Step 1: 기존 테스트 2개를 새 곡선 기준으로 재보정**

`app/lib/easing.test.ts`에서 아래 두 테스트를 교체한다. **나머지 테스트는 손대지 않는다** — 그것들이 유지되어야 할 성질(천장 불가침·단조·시작점·NaN 없음)이다.

```ts
  it('추정 시간에 도달하면 갭의 정확히 90%를 지난다', () => {
    // K=0.9. 남은 10%는 "청크가 실제로 착지할 자리"로 일부러 비워둔다 —
    // 여기가 좁으면 착지가 늦을 때 바가 죽은 채로 기다린다.
    expect(easeToward(0, 100, 20_000, 20_000)).toBeCloseTo(90, 6);
  });

  it('추정보다 오래 걸리면 기어간다 — 거짓말이 아니라 크롤로 열화', () => {
    // 추정의 3배를 써도 갭의 90% → 98.6%. 40초에 8.6포인트다.
    const at1x = easeToward(0, 100, 20_000, 20_000);
    const at3x = easeToward(0, 100, 60_000, 20_000);
    expect(at3x - at1x).toBeLessThan(10);
    expect(at3x).toBeLessThan(100);
  });
```

- [ ] **Step 2: 새 성질 테스트 3개를 추가**

`app/lib/easing.test.ts`의 `describe('easeToward', ...)` 안에 덧붙인다.

```ts
  it('추정 시간까지는 선형이다 — 앞으로 쏠리지 않는다', () => {
    // 옛 지수 곡선은 10% 지점에서 이미 갭의 26%를 지나 있었다.
    expect(easeToward(0, 100, 2_000, 20_000)).toBeCloseTo(9, 6);
    expect(easeToward(0, 100, 5_000, 20_000)).toBeCloseTo(22.5, 6);
    expect(easeToward(0, 100, 10_000, 20_000)).toBeCloseTo(45, 6);
  });

  it('추정 시점에서 두 구간이 이어진다 — 이음매에 점프가 없다', () => {
    const before = easeToward(0, 100, 19_999, 20_000);
    const at = easeToward(0, 100, 20_000, 20_000);
    const after = easeToward(0, 100, 20_001, 20_000);
    expect(at - before).toBeLessThan(0.01);
    expect(after - at).toBeLessThan(0.01);
    expect(before).toBeLessThanOrEqual(at);
    expect(at).toBeLessThanOrEqual(after);
  });

  it('갭이 좁아도 천장을 넘지 않는다', () => {
    // 밴드가 얇을 때(verify 5%p 클램프 하한) 부동소수 반올림으로 천장에
    // 닿는 일이 없어야 한다.
    for (const elapsed of [0, 1_000, 100_000, 1e12]) {
      expect(easeToward(95, 100, elapsed, 2_000)).toBeLessThan(100);
    }
  });
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인**

```bash
npx vitest run app/lib/easing.test.ts
```

Expected: FAIL. "추정 시간까지는 선형이다"가 9 대신 25.9를 받고, "정확히 90%"가 90 대신 95.02를 받는다.

- [ ] **Step 4: 곡선을 교체**

`app/lib/easing.ts`를 아래로 통째로 바꾼다.

```ts
/**
 * 천장을 향한 이징 — **점근할 뿐 절대 도달하지 않는다.**
 *
 * 진행 바가 이 성질에 기대고 있다. 시간으로 움직이는 바는 언제든 실제 진행을
 * 앞질러 거짓말이 될 수 있는데, 이 곡선은 수학적으로 천장을 넘지 못하므로
 * 추정이 짧으면 거짓말 대신 **크롤로 열화**된다. `docs/decisions.md` §2-7이
 * 지키려던 성질이 바로 이것이다.
 *
 * 곡선은 두 구간이다:
 *
 *   t < D :  p = K · (t/D)                     선형
 *   t ≥ D :  p = 1 − (1−K) · e^(−(t−D)/D)      크롤
 *
 * 옛 곡선은 전 구간 지수(`1 − e^(−3t/D)`)였다. 그건 t=0에서 가장 빨라서 flash
 * 20초 런이 2초 만에 갭의 26%를 지나갔다 — 사용자에겐 "시작하자마자 사십몇
 * 프로"로 보인다. 앞쏠림은 §6-5가 노린 성질이 아니라 지수 곡선에 딸려온
 * 부작용이었다. 천장 불가침만 남기고 앞쏠림은 버린다.
 *
 * K를 1이 아니라 0.9로 두는 건 남은 10%를 **청크가 실제로 착지할 자리**로
 * 비워두기 위해서다. 이 자리가 좁으면 착지가 늦을 때 바가 천장에 붙어 죽는다.
 */
const K = 0.9;

export function easeToward(
  from: number,
  ceiling: number,
  elapsedMs: number,
  expectedMs: number,
): number {
  if (ceiling <= from) return from;
  if (!(expectedMs > 0)) return from;
  const t = Math.max(0, elapsedMs);
  // 두 식은 t=D에서 모두 K를 주므로 이음매가 연속이다.
  const raw =
    t < expectedMs
      ? K * (t / expectedMs)
      : 1 - (1 - K) * Math.exp(-(t - expectedMs) / expectedMs);
  // 경과가 아주 크면 Math.exp가 부동소수 언더플로로 정확히 0이 되어 raw가
  // 정확히 1이 된다(천장 불가침 위반). 실사용 범위에선 발동하지 않는 가드다.
  const progress = Math.min(raw, 0.999999);
  return from + (ceiling - from) * progress;
}
```

- [ ] **Step 5: 테스트를 돌려 통과를 확인**

```bash
npx vitest run app/lib/easing.test.ts
```

Expected: PASS, 전부. 특히 "천장에 절대 도달하지 않는다"와 "경과에 대해 단조 증가한다"가 손대지 않은 채로 통과해야 한다 — 여기가 깨지면 곡선이 틀린 것이다.

- [ ] **Step 6: 커밋**

```bash
git add app/lib/easing.ts app/lib/easing.test.ts
git commit -m "진행 바 이징에서 앞쏠림을 버리고 추정까지 선형으로 간다

옛 지수 곡선은 t=0에서 가장 빨라 flash 20초 런이 2초 만에 갭의 26%를
지나갔다. 추정 시점까지 선형(K=0.9)으로 가고 초과분만 지수로 기어가게
바꾼다. 천장 불가침은 그대로 — 추정이 짧아도 거짓말 대신 크롤이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `catchupValue` — floor 점프를 슬라이드로 흡수

**Files:**
- Modify: `app/lib/easing.ts` (파일 끝에 추가)
- Test: `app/lib/easing.test.ts` (새 `describe` 블록)

**Interfaces:**
- Consumes: 없음
- Produces: `catchupValue(from: number, to: number, elapsedMs: number, catchupMs: number): number` — Task 4가 프레임마다 호출한다.

**왜:** 지금 `useEasedProgress`는 `Math.max(highWater, floor, ease)`로 floor를 **즉시** 반영한다. 청크가 한 웨이브로 몰려 착지하면 floor가 한 번에 뛰고 바가 점프한다.

- [ ] **Step 1: 실패하는 테스트를 작성**

`app/lib/easing.test.ts` 파일 끝에 추가하고, 맨 위 import를 `import { catchupValue, easeToward } from './easing';`로 바꾼다.

```ts
describe('catchupValue', () => {
  it('시작점에서 출발해 목표에 정확히 도달한다', () => {
    // easeToward와 달리 여기선 도달해야 한다 — floor는 이미 일어난 실제
    // 진행이라 "점근"할 이유가 없다. 점프를 눈에 보이는 이동으로 바꿀 뿐이다.
    expect(catchupValue(80, 91, 0, 400)).toBe(80);
    expect(catchupValue(80, 91, 400, 400)).toBe(91);
  });

  it('중간에서 선형이다', () => {
    expect(catchupValue(80, 90, 200, 400)).toBeCloseTo(85, 6);
    expect(catchupValue(0, 100, 100, 400)).toBeCloseTo(25, 6);
  });

  it('시간이 지나도 목표를 넘지 않는다', () => {
    expect(catchupValue(80, 91, 10_000, 400)).toBe(91);
  });

  it('경과가 음수여도 시작점 아래로 안 간다', () => {
    expect(catchupValue(80, 91, -100, 400)).toBe(80);
  });

  it('catchupMs가 0이나 음수면 즉시 목표를 준다 — 0으로 나누지 않는다', () => {
    expect(catchupValue(80, 91, 0, 0)).toBe(91);
    expect(catchupValue(80, 91, 0, -1)).toBe(91);
  });

  it('목표가 시작점보다 낮으면 시작점을 지킨다 — 단조성', () => {
    expect(catchupValue(91, 80, 200, 400)).toBe(91);
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

```bash
npx vitest run app/lib/easing.test.ts
```

Expected: FAIL — `catchupValue is not a function` (또는 import 에러).

- [ ] **Step 3: 구현을 추가**

`app/lib/easing.ts` 파일 끝에 붙인다.

```ts
/**
 * 이미 일어난 진행(floor)이 뛸 때, 점프 대신 짧게 미끄러지는 값.
 *
 * `easeToward`와 반대로 **목표에 정확히 도달한다.** floor는 추정이 아니라
 * 실제로 착지한 청크가 만든 값이라 점근할 이유가 없다 — 바꾸는 건 도달
 * 여부가 아니라 도달하는 모양이다.
 *
 * 이게 필요한 이유: Pro 1,124블록 런은 청크 5개가 전부 한 웨이브라
 * `onCompleted`가 끝에 몰려서 불린다. floor를 즉시 반영하면 바가 한 번에
 * 뛴다 — 사용자에겐 "확 구십몇 프로로 점프"로 보인다.
 *
 * 목표가 시작점보다 낮으면 시작점을 돌려준다. 바는 뒤로 가지 않는다.
 */
export function catchupValue(
  from: number,
  to: number,
  elapsedMs: number,
  catchupMs: number,
): number {
  if (to <= from) return from;
  if (!(catchupMs > 0)) return to;
  const progress = Math.min(1, Math.max(0, elapsedMs) / catchupMs);
  return from + (to - from) * progress;
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인**

```bash
npx vitest run app/lib/easing.test.ts
```

Expected: PASS, 전부 (Task 1의 테스트 포함).

- [ ] **Step 5: 커밋**

```bash
git add app/lib/easing.ts app/lib/easing.test.ts
git commit -m "floor 점프를 흡수할 catchupValue를 추가한다

청크가 한 웨이브로 몰려 착지하면 floor가 한 번에 뛴다. easeToward와 달리
목표에 정확히 도달한다 — floor는 추정이 아니라 실제 진행이라 점근할 이유가
없고, 바꾸는 건 도달 여부가 아니라 모양이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: weight 기반 밴드 — 안 도는 단계는 폭을 갖지 않는다

**Files:**
- Modify: `app/lib/progressStages.ts` (전면 개편)
- Test: `app/lib/progressStages.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces (Task 5가 전부 사용):
  - `export interface StageWeights { context: number; glossary: number; translate: number; verify: number }`
  - `bandsForRun(weights: StageWeights): Record<StageKey, [number, number]>`
  - `stageOrderForRun(weights: StageWeights): StageKey[]`
  - `overallPercent(p: TranslationProgress, opts: { enrichDone: boolean; glossaryEnabled: boolean; glossaryDone: boolean; bands: Record<StageKey, [number, number]> }): number`
  - `stageViews(percent: number, bands: Record<StageKey, [number, number]>, order: StageKey[]): StageView[]`
  - `activeStage(percent: number, bands: Record<StageKey, [number, number]>, order: StageKey[]): StageKey`
  - `StageKey`, `StageView`는 지금 정의 그대로.
- **제거**: `bandsFor(glossaryEnabled)`, `stageOrder(glossaryEnabled)` — `bandsForRun`/`stageOrderForRun`이 대체한다.

**왜:** `ENRICH_ALWAYS_DONE = true`(page.tsx:33)라서 enrich는 진행 화면에 오기 전에 끝나 있다. 그런데 밴드는 context에 0-15를 고정 배분한다. 글로사리까지 OFF면 0-25가 통째로 죽은 구간이고, 바는 태어날 때 25%다.

- [ ] **Step 1: 테스트 파일을 새 API로 교체**

`app/lib/progressStages.test.ts`를 통째로 아래로 바꾼다.

```ts
import { describe, expect, it } from 'vitest';
import type { TranslationProgress } from '../types/translation';
import {
  activeStage,
  bandsForRun,
  overallPercent,
  stageOrderForRun,
  stageViews,
  type StageWeights,
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

/** 실사용 기본 런: enrich는 진행 화면 전에 끝났고 글로사리는 OFF. */
const TYPICAL: StageWeights = {
  context: 0,
  glossary: 0,
  translate: 20_000,
  verify: 2_000,
};

/** 글로사리 ON. */
const WITH_GLOSSARY: StageWeights = {
  context: 0,
  glossary: 15_000,
  translate: 20_000,
  verify: 2_000,
};

/** Pro 장편 — verify 비례 폭이 1.2%p라 하한 클램프가 걸린다. */
const LONG_RUN: StageWeights = {
  context: 0,
  glossary: 0,
  translate: 165_000,
  verify: 2_000,
};

describe('stageOrderForRun', () => {
  it('weight가 0인 단계는 목록에서 빠진다', () => {
    expect(stageOrderForRun(TYPICAL)).toEqual(['translate', 'verify']);
    expect(stageOrderForRun(WITH_GLOSSARY)).toEqual([
      'glossary',
      'translate',
      'verify',
    ]);
  });

  it('전부 0이면 translate 하나로 떨어진다 — 0으로 나누지 않기 위해', () => {
    expect(
      stageOrderForRun({ context: 0, glossary: 0, translate: 0, verify: 0 }),
    ).toEqual(['translate']);
  });
});

describe('bandsForRun', () => {
  it('실사용 기본 런은 0에서 시작한다 — 이게 이 변경의 핵심이다', () => {
    // 옛 밴드는 context 0-15 / glossary 15-25를 고정 배분해서, 두 단계가
    // 진행 화면 전에 끝나 있어도 바가 25%에서 태어났다.
    expect(bandsForRun(TYPICAL).translate[0]).toBe(0);
  });

  it('활성 단계의 밴드가 0에서 시작해 100에서 끝나고 구멍이 없다', () => {
    for (const w of [TYPICAL, WITH_GLOSSARY, LONG_RUN]) {
      const bands = bandsForRun(w);
      const order = stageOrderForRun(w);
      expect(bands[order[0]][0]).toBe(0);
      expect(bands[order[order.length - 1]][1]).toBe(100);
      for (let i = 1; i < order.length; i += 1) {
        expect(bands[order[i]][0]).toBeCloseTo(bands[order[i - 1]][1], 9);
      }
    }
  });

  it('폭이 예상 시간에 비례한다', () => {
    // translate 20s / verify 2s → 90.9 : 9.1. 클램프 범위 안이라 그대로.
    const bands = bandsForRun(TYPICAL);
    expect(bands.translate[1]).toBeCloseTo(90.909, 2);
  });

  it('verify 폭을 5~12%p로 클램프한다', () => {
    // Pro 165초 런의 비례 폭은 1.2%p다. 회수 스윕이 걸리면 움직일 여지가
    // 없어 §6-5가 없애려던 정체가 그대로 재현된다.
    const long = bandsForRun(LONG_RUN);
    expect(long.verify[1] - long.verify[0]).toBeCloseTo(5, 6);

    // 반대쪽: translate가 아주 짧으면 verify 비례 폭이 12%p를 넘는다.
    const short = bandsForRun({
      context: 0,
      glossary: 0,
      translate: 3_000,
      verify: 2_000,
    });
    expect(short.verify[1] - short.verify[0]).toBeCloseTo(12, 6);
  });

  it('클램프가 걸려도 폭의 합은 정확히 100이다', () => {
    for (const w of [TYPICAL, WITH_GLOSSARY, LONG_RUN]) {
      const bands = bandsForRun(w);
      const sum = stageOrderForRun(w).reduce(
        (acc, k) => acc + (bands[k][1] - bands[k][0]),
        0,
      );
      expect(sum).toBeCloseTo(100, 9);
    }
  });

  it('안 도는 단계도 Record를 채운다 — 폭 0으로', () => {
    const bands = bandsForRun(TYPICAL);
    expect(bands.context[1] - bands.context[0]).toBe(0);
    expect(bands.glossary[1] - bands.glossary[0]).toBe(0);
  });

  it('단계가 하나뿐이면 100을 다 갖는다', () => {
    const only = bandsForRun({
      context: 0,
      glossary: 0,
      translate: 0,
      verify: 5_000,
    });
    expect(only.verify).toEqual([0, 100]);
  });
});

describe('stageViews', () => {
  it('활성 단계만 낸다', () => {
    const views = stageViews(50, bandsForRun(TYPICAL), stageOrderForRun(TYPICAL));
    expect(views.map((v) => v.key)).toEqual(['translate', 'verify']);
  });

  it("어떤 뷰도 'skipped' 상태를 갖지 않는다", () => {
    for (const w of [TYPICAL, WITH_GLOSSARY, LONG_RUN]) {
      const bands = bandsForRun(w);
      const order = stageOrderForRun(w);
      for (const pct of [0, 10, 20, 50, 95, 100]) {
        for (const v of stageViews(pct, bands, order)) {
          expect(['pending', 'active', 'done']).toContain(v.state);
        }
      }
    }
  });

  it('0%에서 첫 단계가 active다 — pending으로 시작하지 않는다', () => {
    const views = stageViews(0, bandsForRun(TYPICAL), stageOrderForRun(TYPICAL));
    expect(views[0].state).toBe('active');
  });

  it('100%면 전부 done이다', () => {
    for (const w of [TYPICAL, WITH_GLOSSARY]) {
      for (const v of stageViews(100, bandsForRun(w), stageOrderForRun(w))) {
        expect(v.state).toBe('done');
      }
    }
  });
});

describe('overallPercent', () => {
  /** enrich 끝남 + 글로사리 OFF — 실사용 기본 런의 opts. */
  const opts = (w: StageWeights) => ({
    enrichDone: true,
    glossaryEnabled: false,
    glossaryDone: true,
    bands: bandsForRun(w),
  });

  it('청크 착지 전에는 0이다 — 옛 밴드에선 25였다', () => {
    const pct = overallPercent(BASE, opts(TYPICAL));
    expect(Number.isNaN(pct)).toBe(false);
    expect(pct).toBe(0);
  });

  it('청크가 절반 끝나면 translate 밴드의 중간이다', () => {
    const pct = overallPercent(
      { ...BASE, currentChunk: 5, totalChunks: 10 },
      opts(TYPICAL),
    );
    expect(pct).toBeCloseTo(45.45, 1);
  });

  it('글로사리 추출 중이면 글로사리 밴드 안에 머문다', () => {
    const bands = bandsForRun(WITH_GLOSSARY);
    const pct = overallPercent(BASE, {
      enrichDone: true,
      glossaryEnabled: true,
      glossaryDone: false,
      bands,
    });
    expect(pct).toBeGreaterThan(bands.glossary[0]);
    expect(pct).toBeLessThan(bands.glossary[1]);
  });

  it("stage가 'done'이면 100", () => {
    expect(overallPercent({ ...BASE, stage: 'done' }, opts(TYPICAL))).toBe(100);
  });

  it('finalizing은 recovering보다 앞선다', () => {
    const rec = overallPercent({ ...BASE, stage: 'recovering' }, opts(TYPICAL));
    const fin = overallPercent({ ...BASE, stage: 'finalizing' }, opts(TYPICAL));
    expect(fin).toBeGreaterThan(rec);
  });
});

describe('activeStage', () => {
  it('퍼센트가 속한 밴드의 단계를 낸다', () => {
    const bands = bandsForRun(TYPICAL);
    const order = stageOrderForRun(TYPICAL);
    expect(activeStage(0, bands, order)).toBe('translate');
    expect(activeStage(50, bands, order)).toBe('translate');
    expect(activeStage(95, bands, order)).toBe('verify');
  });

  it('100%에서도 유효한 단계를 낸다', () => {
    const bands = bandsForRun(TYPICAL);
    const order = stageOrderForRun(TYPICAL);
    expect(activeStage(100, bands, order)).toBe('verify');
  });
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인**

```bash
npx vitest run app/lib/progressStages.test.ts
```

Expected: FAIL — `bandsForRun is not exported` 류의 에러.

- [ ] **Step 3: `progressStages.ts`를 통째로 교체**

```ts
import type { TranslationProgress } from '../types/translation';

/** 진행 화면이 보여주는 단계. 순서는 stageOrderForRun()이 정한다. */
export type StageKey = 'context' | 'glossary' | 'translate' | 'verify';

export interface StageView {
  key: StageKey;
  state: 'pending' | 'active' | 'done';
}

/** 각 단계의 예상 소요(ms). 0이면 이번 런에서 안 도는 단계다. */
export interface StageWeights {
  context: number;
  glossary: number;
  translate: number;
  verify: number;
}

/** 순서는 고정 — weight가 폭을 정하고, 이 배열이 자리를 정한다. */
const ALL_STAGES: StageKey[] = ['context', 'glossary', 'translate', 'verify'];

/**
 * verify 밴드 폭의 하한·상한(%p).
 *
 * 하한: Pro 165초 런에서 verify 비례 폭은 1.2%p다. 회수 스윕(수십 초까지 갈 수
 * 있다)이 걸리면 그 안에서 움직일 여지가 없어, `decisions.md` §6-5가 없애려던
 * "완료처럼 멈춰 있음"이 그대로 재현된다.
 *
 * 상한: translate가 아주 짧은 파일에서 verify가 화면의 절반을 먹지 않게.
 *
 * 이 클램프는 비례성을 의도적으로 깬다 — 스윕 정체를 막는 대가다.
 */
const VERIFY_MIN_WIDTH = 5;
const VERIFY_MAX_WIDTH = 12;

/**
 * 이번 런에서 실제로 도는 단계만, 순서대로.
 *
 * 옛 `stageOrder(glossaryEnabled)`는 글로사리만 이렇게 처리했다. enrich도
 * 똑같이 다뤄야 한다 — `ENRICH_ALWAYS_DONE`(page.tsx) 때문에 진행 화면에
 * 도달했을 땐 이미 끝나 있어서, 고정 배분된 context 밴드가 죽은 구간이 된다.
 */
export function stageOrderForRun(weights: StageWeights): StageKey[] {
  const active = ALL_STAGES.filter((key) => weights[key] > 0);
  // 전부 0인 런은 없어야 하지만, 있으면 0으로 나누는 대신 translate에 다 준다.
  return active.length > 0 ? active : ['translate'];
}

function widthsFor(
  weights: StageWeights,
  active: StageKey[],
): Record<StageKey, number> {
  const widths: Record<StageKey, number> = {
    context: 0,
    glossary: 0,
    translate: 0,
    verify: 0,
  };
  if (active.length === 1) {
    widths[active[0]] = 100;
    return widths;
  }

  const total = active.reduce((sum, key) => sum + weights[key], 0);
  if (!active.includes('verify')) {
    for (const key of active) widths[key] = (100 * weights[key]) / total;
    return widths;
  }

  // verify만 클램프한다 — 스윕이 붙을 수 있는 유일한 단계라서다.
  const raw = (100 * weights.verify) / total;
  const verifyWidth = Math.min(
    VERIFY_MAX_WIDTH,
    Math.max(VERIFY_MIN_WIDTH, raw),
  );
  const rest = active.filter((key) => key !== 'verify');
  const restTotal = rest.reduce((sum, key) => sum + weights[key], 0);
  widths.verify = verifyWidth;
  for (const key of rest) {
    widths[key] = ((100 - verifyWidth) * weights[key]) / restTotal;
  }
  return widths;
}

/**
 * 단계별 퍼센트 밴드 — 폭은 예상 소요에 비례한다.
 *
 * 안 도는 단계(weight 0)는 **폭 0**의 밴드를 받는다. Record 타입을 채우기 위한
 * 자리일 뿐, `stageOrderForRun`이 목록에서 빼므로 화면에는 나오지 않는다.
 *
 * ⚠️ 호출부는 이 결과를 **런 시작에 한 번 계산하고 얼려야 한다.**
 * `estimatedRemainingMs`는 실측 보정으로 계속 바뀌는데, 밴드가 그때마다
 * 움직이면 이미 지난 구간의 경계가 이동해 바가 뒤로 간다.
 */
export function bandsForRun(
  weights: StageWeights,
): Record<StageKey, [number, number]> {
  const active = stageOrderForRun(weights);
  const widths = widthsFor(weights, active);
  const bands = {} as Record<StageKey, [number, number]>;
  let cursor = 0;
  for (const key of ALL_STAGES) {
    if (!active.includes(key)) {
      bands[key] = [cursor, cursor];
      continue;
    }
    bands[key] = [cursor, cursor + widths[key]];
    cursor = bands[key][1];
  }
  // 부동소수 누적 오차로 마지막이 100에 정확히 닿지 않을 수 있다. 바가
  // 가득 차야 하므로 명시적으로 붙인다.
  const last = active[active.length - 1];
  bands[last] = [bands[last][0], 100];
  return bands;
}

function lerp(band: [number, number], ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return band[0] + (band[1] - band[0]) * clamped;
}

export function overallPercent(
  p: TranslationProgress,
  opts: {
    enrichDone: boolean;
    glossaryEnabled: boolean;
    glossaryDone: boolean;
    bands: Record<StageKey, [number, number]>;
  },
): number {
  const { bands } = opts;
  if (!opts.enrichDone) return lerp(bands.context, 0.5);
  if (opts.glossaryEnabled && !opts.glossaryDone) {
    return lerp(bands.glossary, 0.5);
  }

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
  bands: Record<StageKey, [number, number]>,
  order: StageKey[],
): StageView[] {
  return order.map((key) => {
    const [start, end] = bands[key];
    if (percent >= end) return { key, state: 'done' as const };
    if (percent >= start) return { key, state: 'active' as const };
    return { key, state: 'pending' as const };
  });
}

/** 이 퍼센트가 속한 단계. 이징 훅이 천장(밴드 끝)을 고르는 데 쓴다. */
export function activeStage(
  percent: number,
  bands: Record<StageKey, [number, number]>,
  order: StageKey[],
): StageKey {
  for (const key of order) {
    if (percent < bands[key][1]) return key;
  }
  return order[order.length - 1];
}
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인**

```bash
npx vitest run app/lib/progressStages.test.ts
```

Expected: PASS, 전부.

- [ ] **Step 5: 타입 체크로 깨진 호출부를 확인**

```bash
npx tsc --noEmit
```

Expected: `ProgressStep.tsx`에서 `bandsFor`/`stageOrder`를 못 찾는다는 에러. **여기서 고치지 않는다** — Task 5가 배선한다. 에러 목록이 `ProgressStep.tsx`에만 국한되는지 확인만 한다. 다른 파일이 나오면 그 파일도 Task 5 범위에 넣는다.

- [ ] **Step 6: 커밋 (타입 에러가 남은 상태로)**

`ProgressStep.tsx`가 Task 5에서 고쳐질 때까지 `tsc`는 실패한다. 순수 함수 계층을 독립적으로 리뷰받기 위한 의도적 중간 커밋이다.

```bash
git add app/lib/progressStages.ts app/lib/progressStages.test.ts
git commit -m "진행 바 밴드를 고정 상수에서 예상 시간 비례 계산으로 바꾼다

ENRICH_ALWAYS_DONE 때문에 enrich는 진행 화면 전에 끝나 있는데, 밴드는
context에 0-15를 고정 배분했다. 글로사리까지 OFF면 0-25가 죽은 구간이고
바가 25%에서 태어난다. 안 도는 단계는 폭 0을 받게 하고, 나머지는 예상
소요에 비례해 나눈다. verify만 5~12%p로 클램프한다 — 회수 스윕이 붙을 수
있는 유일한 단계라 움직일 여지가 필요하다.

호출부(ProgressStep)는 다음 커밋에서 배선한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `useEasedProgress`에 캐치업 배선

**Files:**
- Modify: `app/hooks/useEasedProgress.ts`
- Test: 없음 (React 테스트 라이브러리가 이 리포에 없다. 계산은 Task 1·2의 순수 함수가 이미 테스트됐고, 이 태스크는 배선만 한다.)

**Interfaces:**
- Consumes: `easeToward`, `catchupValue` (Task 1·2)
- Produces: `useEasedProgress(input: { floor: number; bandEnd: number; expectedMs: number; snap?: boolean }): number` — 시그니처 무변경. Task 5가 그대로 호출한다.

**왜:** 지금 `Math.max(highWater, floor, ease)`가 floor를 즉시 반영해 점프를 만든다. 그리고 `anchor.from`이 `Math.max(highWater, floor)`라 이징 자체도 점프를 타고 올라간다.

- [ ] **Step 1: 파일을 통째로 교체**

`app/hooks/useEasedProgress.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { catchupValue, easeToward } from '../lib/easing';

/** done 스냅의 이징 시간 — τ≈150ms가 되도록 3τ로 준다. */
const SNAP_MS = 450;

/** 스냅이 이 위로 오면 100으로 붙인다. 이징은 천장에 닿지 못하므로,
 *  바가 실제로 가득 차려면 마지막 한 뼘은 명시적으로 채워야 한다. */
const SNAP_CLAMP_AT = 99.5;

/** floor가 뛸 때 따라붙는 시간. 점프를 눈에 보이는 이동으로 바꾼다. */
const CATCHUP_MS = 400;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 진행 바가 그릴 퍼센트.
 *
 *   값 = max( floor를 향한 캐치업, 밴드 끝을 향한 이징 )
 *
 * 이징이 없으면 바는 계단으로 튄다. Pro는 특히 나쁘다 — 청크 5개가 한 웨이브로
 * 동시 실행돼서 142초 동안 착지 이벤트가 0건이고, 바가 밴드 바닥에 멈춰 있다.
 * 반대로 이징만 쓰면 실제 진행을 앞질러 거짓말이 된다. 둘의 max가 답이다:
 * 이징은 밴드 끝에 **도달하지 못하므로** 앞지를 수 없고, 실제 착지는 언제든
 * 바닥을 밀어올릴 수 있다.
 *
 * floor를 **즉시** 반영하지 않는 게 v2에서 바뀐 점이다. 착지가 한 웨이브로
 * 몰리면 floor가 한 번에 뛰는데, 그대로 그리면 바가 점프한다. `catchupValue`가
 * CATCHUP_MS에 걸쳐 미끄러뜨린다.
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
  /** 이징의 기준점. */
  const anchor = useRef<{ at: number; from: number }>({ at: 0, from: floor });
  /** floor 캐치업의 기준점. */
  const catchup = useRef<{ at: number; from: number; to: number }>({
    at: 0,
    from: floor,
    to: floor,
  });

  // expectedMs는 일부러 뺐다 — 실측 보정으로 남은 시간 추정이 바뀔 때마다
  // (useTranslation의 onCompleted) 이징 속도만 바뀌어야지, 위치가 되감기며
  // 버벅이면 안 된다. eslint-plugin-react-hooks의 exhaustive-deps 자동수정이
  // 이 줄을 "고치면" 그 버벅임이 조용히 되살아난다.
  useEffect(() => {
    // from에 floor를 섞지 않는다 — 섞으면 floor 점프가 이징 기준점을 통해
    // 그대로 튀어 올라와 캐치업이 무의미해진다. highWater는 이미 그려진
    // 값이라 여기가 정확한 출발점이다.
    anchor.current = { at: performance.now(), from: highWater.current };
  }, [floor, bandEnd, snap]);

  useEffect(() => {
    catchup.current = {
      at: performance.now(),
      from: highWater.current,
      to: floor,
    };
  }, [floor]);

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
      const now = performance.now();
      const { at, from } = anchor.current;
      const c = catchup.current;
      let next = Math.max(
        highWater.current,
        catchupValue(c.from, c.to, now - c.at, CATCHUP_MS),
        easeToward(
          from,
          snap ? 100 : bandEnd,
          now - at,
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

- [ ] **Step 2: 린트와 타입을 확인**

```bash
npx eslint app/hooks/useEasedProgress.ts
```

Expected: 통과. `exhaustive-deps` 경고가 나오면 **자동수정하지 말 것** — 주석이 설명하는 의도적 누락이다.

- [ ] **Step 3: 커밋**

```bash
git add app/hooks/useEasedProgress.ts
git commit -m "floor 점프를 400ms 캐치업으로 흡수한다

floor를 즉시 반영하면 청크가 한 웨이브로 몰려 착지할 때 바가 점프한다.
이징 기준점(anchor.from)에서도 floor를 뺐다 — 섞으면 점프가 이징을 타고
그대로 튀어 올라와 캐치업이 무의미해진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `ProgressStep` 배선 — 밴드 얼림 + `model` prop

**Files:**
- Modify: `app/components/simple/ProgressStep.tsx`
- Modify: `app/page.tsx:305-313`
- Modify: `app/dev/preview/PreviewHarness.tsx:194-`
- Test: 없음 (배선만. 계산은 Task 1·2·3이 테스트했다.)

**Interfaces:**
- Consumes: `bandsForRun`, `stageOrderForRun`, `overallPercent`, `stageViews`, `activeStage`, `StageKey`, `StageWeights` (Task 3); `useEasedProgress` (Task 4)
- Produces: `ProgressStep`에 `model: string` prop 추가. 나머지 prop은 그대로.

**왜 `model` prop이 필요한가:** 밴드를 얼리려면 첫 렌더에 translate weight가 있어야 하는데, `progress.totalEstimateMs`는 첫 청크 요청 **전까지 0**이다(`useTranslation.ts:339-348`에서 설정된다). 글로사리 대기가 걸리면 최대 15초 동안 0이다. 그 사이에 얼리면 Pro 런이 flash 폭을 갖는다. `estimateRunMsFromBlocks(totalLines, model)`은 첫 렌더부터 확정값이고, 설정 화면 ETA(`page.tsx:132-136`)와 **같은 함수**라 두 숫자가 어긋나지 않는다.

- [ ] **Step 1: `ProgressStep.tsx`의 import와 상수를 교체**

`app/components/simple/ProgressStep.tsx` 상단(1~19행)을 아래로 바꾼다.

```tsx
'use client';

import { useRef } from 'react';
import type { TranslationProgress } from '../../types/translation';
import { StepBreadcrumb } from '../StepBreadcrumb';
import { COPY } from '../../i18n/simpleCopy';
import { GLOSSARY_WAIT_MS, MIN_VERIFY_MS } from '../../config/constants';
import { estimateRunMsFromBlocks } from '../../lib/progressEstimate';
import { useEasedProgress } from '../../hooks/useEasedProgress';
import {
  activeStage,
  bandsForRun,
  overallPercent,
  stageOrderForRun,
  stageViews,
  type StageKey,
  type StageWeights,
} from '../../lib/progressStages';
```

`DEFAULT_MODEL`과 `estimateTranslationMs` import는 사라진다 — `model` prop이 있으므로 폴백에 기본 모델을 쓸 이유가 없다. (Pro 런이 첫 청크 전까지 flash의 "약 20초"를 보여주던 잠재 버그도 같이 없어진다.)

- [ ] **Step 2: props에 `model`을 추가**

`ProgressStepProps` 인터페이스에 추가한다.

```tsx
  /** False only while the cast-sheet (glossary) extraction is still in flight. */
  glossaryDone: boolean;
  /** 이 런의 모델. 밴드 폭과 남은 시간 추정에 쓴다 — totalEstimateMs가
   *  첫 청크 요청 전까지 0이라 그것만으로는 Pro/flash를 구분할 수 없다. */
  model: string;
```

그리고 함수 시그니처의 구조분해에 `model`을 넣는다.

```tsx
export function ProgressStep({
  progress,
  totalLines,
  onCancel,
  enrichDone,
  glossaryEnabled,
  glossaryDone,
  model,
}: ProgressStepProps) {
```

- [ ] **Step 3: 밴드 얼림과 퍼센트 계산을 교체**

함수 본문 첫머리(기존 64~97행, `const floor = ...`부터 `useEasedProgress` 호출까지)를 아래로 바꾼다.

```tsx
  // 밴드는 런 시작에 한 번 계산하고 **얼린다.** estimatedRemainingMs는 실측
  // 보정으로 계속 바뀌는데, 밴드가 그때마다 움직이면 이미 지난 구간의 경계가
  // 이동해 바가 뒤로 간다.
  //
  // translate weight를 totalEstimateMs가 아니라 estimateRunMsFromBlocks로
  // 잡는 것도 같은 이유다 — totalEstimateMs는 첫 청크 요청 전까지 0이고
  // (useTranslation.ts에서 설정된다), 글로사리 대기가 걸리면 최대
  // GLOSSARY_WAIT_MS 동안 0이다. 그 사이에 얼리면 Pro 런이 flash 폭을 갖는다.
  const frozen = useRef<{
    bands: Record<StageKey, [number, number]>;
    order: StageKey[];
  } | null>(null);
  if (frozen.current === null) {
    const weights: StageWeights = {
      context: enrichDone ? 0 : CONTEXT_EXPECTED_MS,
      glossary: glossaryEnabled && !glossaryDone ? GLOSSARY_WAIT_MS : 0,
      translate: estimateRunMsFromBlocks(Math.max(1, totalLines), model),
      verify: MIN_VERIFY_MS,
    };
    frozen.current = {
      bands: bandsForRun(weights),
      order: stageOrderForRun(weights),
    };
  }
  const { bands, order } = frozen.current;

  const floor = overallPercent(progress, {
    enrichDone,
    glossaryEnabled,
    glossaryDone,
    bands,
  });
  const stage = activeStage(floor, bands, order);

  // 스윕은 청크 콜 수 기준 예산이라(recoverySweep.ts) ms 실측이 없다. 2초용
  // MIN_VERIFY_MS로 그대로 이징하면 몇 초 만에 밴드 끝에 닿고 나머지 스윕
  // 시간(수십 초까지 갈 수 있다) 내내 완료처럼 멈춰 있는다. 그래서 스윕 중엔
  // 천장을 밴드 끝 밑으로 낮추고, 더 긴(추정치일 뿐 실측 아님) 예상 시간을
  // 쓴다. verify 폭이 최소 5%p라(progressStages.ts) 이 2%p는 항상 밴드 안이다.
  const isRecovering = progress.stage === 'recovering';
  const bandEnd = isRecovering ? bands.verify[1] - 2 : bands[stage][1];

  // 밴드마다 이징이 기댈 시간이 다르다. translate는 실측 보정을 거친
  // estimatedRemainingMs(useTranslation), 나머지는 그 단계의 대기 상수.
  const blockEstimateMs = estimateRunMsFromBlocks(
    Math.max(1, totalLines),
    model,
  );
  const expectedMs: Record<StageKey, number> = {
    context: CONTEXT_EXPECTED_MS,
    glossary: GLOSSARY_WAIT_MS,
    translate:
      progress.estimatedRemainingMs ||
      progress.totalEstimateMs ||
      blockEstimateMs,
    verify: isRecovering ? RECOVERY_EXPECTED_MS : MIN_VERIFY_MS,
  };

  const percent = useEasedProgress({
    floor,
    bandEnd,
    expectedMs: expectedMs[stage],
    snap: progress.stage === 'done',
  });

  const views = stageViews(percent, bands, order);
  const title = c.stages[stage];
```

- [ ] **Step 4: `totalMs`를 모델 반영값으로 교체**

기존 108행의 `const totalMs = ...` 줄을 바꾼다. 위 주석 블록(102~107행)은 그대로 둔다.

```tsx
  const totalMs = progress.totalEstimateMs || blockEstimateMs;
```

- [ ] **Step 5: `page.tsx`에서 `model`을 넘긴다**

`app/page.tsx:305-313`의 `<ProgressStep .../>`에 한 줄 추가한다. `model`은 이미 같은 스코프에 있다(91행).

```tsx
          <ProgressStep
            progress={translationProgress}
            totalLines={totalLines}
            onCancel={handleCancel}
            enrichDone={ENRICH_ALWAYS_DONE}
            glossaryEnabled={castSheet.enabled}
            glossaryDone={castSheet.status !== 'extracting'}
            model={model}
          />
```

- [ ] **Step 6: `PreviewHarness.tsx`에서도 넘긴다**

`app/dev/preview/PreviewHarness.tsx`의 `<ProgressStep>` 호출에 `model={DEFAULT_MODEL}`을 추가하고, 파일 상단 import에 `DEFAULT_MODEL`을 더한다(이미 `../../config/constants`에서 뭔가 import 중이면 거기 합친다).

```tsx
import { DEFAULT_MODEL } from '../../config/constants';
```

- [ ] **Step 7: 전체 검증**

```bash
npx tsc --noEmit && npx eslint app && npx vitest run && npm run check:tokens
```

Expected: 전부 PASS. Task 3에서 남겨둔 타입 에러가 여기서 해소된다.

- [ ] **Step 8: 브라우저로 실제 확인**

Browser 도구로 dev 서버를 띄우고 자막을 하나 번역해서 아래를 눈으로 확인한다. (Bash로 서버를 띄우지 말 것 — `CLAUDE.md`)

확인 항목:
1. 진행 화면 진입 직후 바가 **0% 근처**에 있다 (25%나 40%가 아니라).
2. 바가 대체로 일정한 속도로 오른다.
3. 끝에서 점프 대신 짧게 미끄러진다.
4. 단계 체크리스트에 '자막을 번역하는 중'과 '타임코드를 검증하는 중' 두 줄만 보인다 (글로사리 OFF 기준).

- [ ] **Step 9: 커밋**

```bash
git add app/components/simple/ProgressStep.tsx app/page.tsx app/dev/preview/PreviewHarness.tsx
git commit -m "진행 바를 런별 밴드에 배선하고 model을 넘긴다

밴드를 첫 렌더에 한 번 계산해 얼린다. translate 폭은 totalEstimateMs가
아니라 estimateRunMsFromBlocks(totalLines, model)로 잡는다 —
totalEstimateMs는 첫 청크 요청 전까지 0이라(글로사리 대기면 최대 15초)
그 사이에 얼리면 Pro 런이 flash 폭을 갖는다. 설정 화면 ETA와 같은
함수라 두 숫자가 어긋나지도 않는다.

남은 시간 표시도 DEFAULT_MODEL 폴백을 버리고 실제 model을 쓴다 — Pro
런이 첫 청크 전까지 flash의 약 20초를 보여주던 잠재 버그가 같이 없어진다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `decisions.md`에 §6-5를 잇는 항목

**Files:**
- Modify: `docs/decisions.md` (파일 끝에 새 절)

**Interfaces:**
- Consumes: Task 1~5의 결과
- Produces: 없음 (문서)

- [ ] **Step 1: 현재 마지막 절 번호를 확인**

```bash
grep -n "^### " docs/decisions.md | tail -5
```

아래 Step 2의 `§N-M`을 실제 다음 번호로 바꿔 쓴다.

- [ ] **Step 2: 절을 추가**

`docs/decisions.md` 끝에 붙인다 (번호는 Step 1에서 확인한 값으로).

```markdown
### N-M. 진행 바 이징의 앞쏠림을 버린다 — §6-5를 뒤집지 않고 좁힌다 (2026-08-15)

**증상**: 실사용에서 바가 "시작하자마자 사십몇 프로대부터 시작해서, 마지막에
확 구십몇 프로로 점프했다가 또 잠깐 멈춘다."

**원인 셋**
1. `ENRICH_ALWAYS_DONE`(page.tsx) 때문에 enrich는 진행 화면에 **오기 전에**
   끝나 있고 글로사리는 기본 OFF다. 그런데 밴드는 context에 0-15,
   glossary에 15-25를 고정 배분했다 — 0~25가 통째로 죽은 구간이고 바는
   태어날 때 25%다.
2. `easeToward`가 `1 − e^(−3t/D)`라 t=0에서 가장 빠르다. flash 20초 런이
   2초 만에 갭의 26%를 지난다 → 25% + 65×0.26 ≈ 42%.
3. 청크 착지가 한 웨이브에 몰리면 floor가 한 번에 뛰고, `useEasedProgress`가
   그걸 즉시 반영했다.

**②와 ③은 한 손잡이의 양쪽 끝이다.** 앞쏠림은 꼬리 점프를 줄이려고 지불한
대가였다 — ②만 고치면 ③이 악화된다. 그래서 셋을 같이 고쳤다.

**§6-5를 뒤집지 않는다.** §6-5가 지킨 성질은 "이징은 천장에 도달하지
못하므로 추정이 짧아도 거짓말이 아니라 크롤로 열화된다"였다. 그건 그대로
유지된다. 버리는 건 그 성질이 아니라 지수 곡선에 **딸려온 부작용**인
앞쏠림이다.

**결정**
- 곡선: `t < D`면 `K·(t/D)` 선형, `t ≥ D`면 `1 − (1−K)·e^(−(t−D)/D)` 크롤.
  `K = 0.9`. 이음매는 연속이고, 천장에는 여전히 도달하지 않는다.
  `K`를 1이 아니라 0.9로 두는 건 남은 10%를 **청크가 실제로 착지할 자리**로
  비워두기 위해서다.
- 밴드: 고정 상수에서 **예상 소요 비례 계산**으로. weight 0인 단계는 폭도
  목록도 갖지 않는다 — §6-5가 글로사리에만 하던 처리를 전 단계로 넓힌 것이다.
  verify만 5~12%p로 클램프한다(회수 스윕이 붙을 수 있는 유일한 단계).
  밴드는 **런 시작에 한 번 계산하고 언다.**
- floor 점프: 즉시 반영 대신 400ms 캐치업.

**함께 고친 것**: `ProgressStep`이 `model` prop을 받는다. 밴드 폭과 남은 시간
추정을 `estimateRunMsFromBlocks(totalLines, model)`로 잡는데, 이건 설정 화면
ETA와 **같은 함수**다. 이전엔 `DEFAULT_MODEL` 폴백을 써서 Pro 런이 첫 청크
요청 전까지 flash의 "약 20초"를 보여줬다.

**주의할 점**
- verify 폭 클램프는 비례성을 **의도적으로 깬다.** Pro 장편에서 verify가 실제
  소요보다 넓은 밴드를 갖는다 → 그 구간에서 바가 실제보다 느리다. 스윕
  정체를 막는 대가다. `RECOVERY_EXPECTED_MS` 실측이 생기면 재검토한다.
- 밴드 얼림은 첫 추정에 의존한다. 첫 추정이 크게 빗나간 런은 밴드 비율이
  끝까지 틀린 채로 간다. 곡선이 초과분을 크롤로 흡수하므로 거짓말은 되지
  않지만 체감 비례성은 떨어진다.
- `K = 0.9`는 실측이 아니라 튜닝값이다. 꼬리 점프가 여전히 거슬리면 올리고,
  추정 초과 런의 크롤이 길게 느껴지면 내린다.

설계 문서: `docs/superpowers/specs/2026-08-15-progress-ui-v2-design.md`
계획 문서: `docs/superpowers/plans/2026-08-15-progress-ui-v2.md`
```

- [ ] **Step 3: 커밋**

```bash
git add docs/decisions.md
git commit -m "진행 바 앞쏠림 폐기 결정을 decisions.md에 남긴다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

**Spec coverage** — 설계 문서의 각 절이 어느 태스크에 있는가:

| 스펙 절 | 태스크 |
|---|---|
| 3-1 weight 밴드 + verify 클램프 + 얼림 | Task 3(계산) + Task 5(얼림) |
| 3-2 곡선 교체 | Task 1 |
| 3-3 캐치업 | Task 2(계산) + Task 4(배선) |
| 4 컴포넌트 경계 | File Structure 표 |
| 5 에러 처리 / 경계 조건 | Task 1 Step 2(갭 좁을 때), Task 2 Step 1(0 나눗셈·역방향), Task 3 Step 1(전부 0·단일 단계·totalChunks 0), Task 5 Step 3(스윕 천장) |
| 6 테스트 | Task 1 Step 1·2, Task 2 Step 1, Task 3 Step 1 |
| 7 문서 | Task 6 |

**스펙에 있었지만 계획에서 다르게 간 것 하나**: 스펙 §3-1은 translate weight를
"이 런의 추정치(`estimateRunMsFromChunks`)"라고 썼다. 계획은
`estimateRunMsFromBlocks(totalLines, model)`을 쓴다 — `estimateRunMsFromChunks`의
결과인 `progress.totalEstimateMs`가 첫 렌더에 0이라(글로사리 대기면 최대 15초)
밴드를 얼릴 수 없기 때문이다. 두 함수는 같은 모델을 공유하고
`estimateRunMsFromBlocks`가 내부에서 `FromChunks`를 부른다. Task 5의 주석과
Task 6의 decisions 항목에 이 이유를 남긴다.

**Type consistency** — 태스크 간 이름·시그니처 대조:
- `easeToward(from, ceiling, elapsedMs, expectedMs)` — Task 1 정의, Task 4 사용 ✓
- `catchupValue(from, to, elapsedMs, catchupMs)` — Task 2 정의, Task 4 사용 ✓
- `StageWeights` 필드명 `context/glossary/translate/verify` — Task 3 정의, Task 5 사용 ✓
- `bandsForRun`/`stageOrderForRun` — Task 3 정의·export, Task 5 import ✓
- `overallPercent`의 `opts.bands`, `stageViews(percent, bands, order)`,
  `activeStage(percent, bands, order)` — Task 3 정의, Task 5 호출 순서 일치 ✓
- `CONTEXT_EXPECTED_MS`·`RECOVERY_EXPECTED_MS`는 `ProgressStep.tsx` 기존 상수
  (38-43행)로 그대로 남는다 — Task 5 Step 1의 import 교체가 이 줄들을 건드리지
  않는다 ✓

**Placeholder scan**: 없음. 모든 코드 단계에 실제 코드가 들어 있다.
