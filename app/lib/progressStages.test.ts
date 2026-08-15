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
