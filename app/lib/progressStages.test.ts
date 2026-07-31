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
