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
