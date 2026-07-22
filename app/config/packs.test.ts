import { describe, it, expect } from 'vitest';
import { CREDIT_PACKS, findPack, orderNameFor, pricePerCredit } from './packs';

/**
 * Prices are a business decision and this file does not second-guess them. What
 * it pins are the three ways a price edit becomes a bug rather than a choice:
 * selling below cost, breaking Toss's field limits, and letting the bulk pack
 * cost more per credit than the small one.
 */
describe('CREDIT_PACKS', () => {
  // A file at MAX_BLOCKS_PER_CREDIT measures ~$0.36, about 500 KRW
  // (constants.ts). Anything at or under this is a loss on every sale.
  const COST_PER_CREDIT_KRW = 500;

  it('prices every credit above what one costs to serve', () => {
    for (const pack of CREDIT_PACKS) {
      expect(pricePerCredit(pack)).toBeGreaterThan(COST_PER_CREDIT_KRW);
    }
  });

  it('never charges more per credit for a bigger pack', () => {
    // The whole reason to offer three sizes. A price edit that inverts this
    // makes the bulk pack strictly worse than buying the small one repeatedly.
    const byCredits = [...CREDIT_PACKS].sort((a, b) => a.credits - b.credits);
    for (let i = 1; i < byCredits.length; i++) {
      expect(pricePerCredit(byCredits[i])).toBeLessThanOrEqual(
        pricePerCredit(byCredits[i - 1]),
      );
    }
  });

  it('uses whole-won amounts, since Toss rejects fractional KRW', () => {
    for (const pack of CREDIT_PACKS) {
      expect(Number.isInteger(pack.amount)).toBe(true);
      expect(Number.isInteger(pack.credits)).toBe(true);
    }
  });

  it('keeps ids unique — the id is what an order row records', () => {
    const ids = CREDIT_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps order names inside the 100-character Toss limit', () => {
    for (const pack of CREDIT_PACKS) {
      expect(orderNameFor(pack).length).toBeLessThanOrEqual(100);
    }
  });

  it('badges at most one pack, or the recommendation means nothing', () => {
    expect(CREDIT_PACKS.filter((p) => p.badge).length).toBeLessThanOrEqual(1);
  });
});

describe('findPack', () => {
  it('resolves a known id', () => {
    expect(findPack(CREDIT_PACKS[0].id)).toEqual(CREDIT_PACKS[0]);
  });

  it('returns undefined for anything else', () => {
    // The client picks the id, so this is the boundary that stops a made-up
    // pack from reaching create_order.
    expect(findPack('free-30000')).toBeUndefined();
  });
});
