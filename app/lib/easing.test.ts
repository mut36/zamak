import { describe, expect, it } from 'vitest';
import { catchupValue, easeToward } from './easing';

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

  it('천장이 시작점 이하면 시작점을 그대로 돌려준다', () => {
    expect(easeToward(90, 90, 5_000, 20_000)).toBe(90);
    expect(easeToward(90, 25, 5_000, 20_000)).toBe(90);
  });

  it('추정이 0이나 음수여도 NaN을 내지 않는다', () => {
    expect(easeToward(25, 90, 5_000, 0)).toBe(25);
    expect(easeToward(25, 90, 5_000, -1)).toBe(25);
  });

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
});

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
