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
