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
