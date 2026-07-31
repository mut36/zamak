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
