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
