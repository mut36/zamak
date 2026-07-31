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
