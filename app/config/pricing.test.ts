import { describe, it, expect } from 'vitest';
import { PRICING_TIERS, pricePerCredit } from './pricing';
import { BLOCKS_PER_CREDIT } from './constants';

/**
 * 가격 자체는 경영 판단이고 이 파일은 그걸 되묻지 않는다. 여기서 붙드는 건
 * **가격 수정이 선택이 아니라 버그가 되는 경로** 하나다: 조용히 적자로
 * 넘어가는 것.
 *
 * 파일 단위 차감이던 시절에는 이 단언을 쓸 수가 없었다 — 같은 1장인데 원가가
 * 파일 길이에 따라 4.6배 벌어져서 "1장의 원가"라는 값이 없었기 때문이다.
 * 1,200줄당 1장이 되면서 1장의 원가가 상수가 됐고, 그래서 하한을 숫자로
 * 적을 수 있게 됐다(docs/decisions.md §6-22).
 */
describe('PRICING_TIERS', () => {
  // docs/tuning/cost-per-block.md의 보수값(글로사리 포함). 줄당 원가 × 1장 분량.
  const COST_PER_LINE_KRW = { lite: 0.39, pro: 1.45 } as const;

  /** 판매가에서 PG 수수료(3.3%)와 VAT(10%)를 뺀 실수취액. */
  function netRevenue(price: number): number {
    return (price * (1 - 0.033)) / 1.1;
  }

  function marginOf(tierId: 'lite' | 'pro', price: number): number {
    const cost = COST_PER_LINE_KRW[tierId] * BLOCKS_PER_CREDIT;
    return (netRevenue(price) - cost) / netRevenue(price);
  }

  it('장당 마진이 25% 아래로 내려가는 팩이 없다', () => {
    // 하한선의 목적은 최저가 팩을 막는 게 아니라, 나중에 볼륨 할인을 넓힐 때
    // 조용히 적자 구간으로 넘어가는 걸 막는 것이다. 25%에서 걸리는 값은
    // 라이트 750원/장 · 프로 2,700원/장.
    for (const tier of PRICING_TIERS) {
      for (const pack of tier.packs) {
        const margin = marginOf(tier.id, pricePerCredit(pack));
        expect(
          margin,
          `${pack.id}: 장당 ${pricePerCredit(pack)}원 → 마진 ${(margin * 100).toFixed(1)}%`,
        ).toBeGreaterThanOrEqual(0.25);
      }
    }
  });

  it('기준가(가장 작은 팩)는 확정된 값 그대로다', () => {
    // 라이트 990 · 프로 3,300은 비교표·랜딩이 인용하는 숫자다. 할인 없는
    // 기준가라 여기서 움직이면 화면 여러 곳이 같이 틀린다.
    const base = (id: 'lite' | 'pro') => {
      const tier = PRICING_TIERS.find((t) => t.id === id);
      return pricePerCredit(tier!.packs[0]);
    };
    expect(base('lite')).toBe(990);
    expect(base('pro')).toBe(3_300);
  });

  it('큰 팩이 작은 팩보다 장당 비싸지 않다', () => {
    // 크기를 여러 개 파는 이유 자체. 이게 뒤집히면 큰 팩은 작은 팩을 반복
    // 구매하는 것보다 순수하게 나쁜 상품이 된다.
    for (const tier of PRICING_TIERS) {
      const byCredits = [...tier.packs].sort((a, b) => a.credits - b.credits);
      for (let i = 1; i < byCredits.length; i++) {
        expect(pricePerCredit(byCredits[i])).toBeLessThanOrEqual(
          pricePerCredit(byCredits[i - 1]),
        );
      }
    }
  });

  it('원 단위 정수만 쓴다 — PG가 소수점 금액을 거부한다', () => {
    for (const tier of PRICING_TIERS) {
      for (const pack of tier.packs) {
        expect(Number.isInteger(pack.amount)).toBe(true);
        expect(Number.isInteger(pack.credits)).toBe(true);
      }
    }
  });

  it('id가 유일하다 — id가 주문 행에 남는 값이다', () => {
    const ids = PRICING_TIERS.flatMap((t) => t.packs.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('리본은 티어당 최대 하나다', () => {
    for (const tier of PRICING_TIERS) {
      expect(tier.packs.filter((p) => p.badge).length).toBeLessThanOrEqual(1);
    }
  });
});
