/**
 * Credit packs — the only thing ZAMAK sells.
 *
 * Prices are provisional (docs/decisions.md): they are anchored on what a human
 * translator charges (~150,000 KRW per title), not on our cost. Cost only sets
 * the floor, and it has to clear the *cap* rather than the average — a
 * MAX_BLOCKS_PER_CREDIT file runs about 500 KRW, so every pack below stays well
 * above that per credit.
 *
 * This table is the price of record. The client sends a pack id and nothing
 * else; /api/payments/prepare looks the amount up here and writes it into the
 * order row before the payment window opens, so a tampered client cannot buy 30
 * credits for 100 won.
 */
export interface CreditPack {
  id: string;
  /** Credits granted on settlement. One credit = one subtitle file. */
  credits: number;
  /** KRW, tax inclusive. Toss charges exactly this. */
  amount: number;
  /** Optional ribbon — at most one pack should carry one. */
  badge?: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: 'starter', credits: 3, amount: 2_900 },
  { id: 'standard', credits: 10, amount: 7_900, badge: '가장 많이 골라요' },
  { id: 'bulk', credits: 30, amount: 18_900 },
] as const;

export function findPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

/** Per-credit price, for the "편당 N원" line under each pack. */
export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.amount / pack.credits);
}

/**
 * The order name Toss shows in the payment window and on the receipt. Their
 * limit is 100 characters; ours is nowhere near it.
 */
export function orderNameFor(pack: CreditPack): string {
  return `ZAMAK 번역권 ${pack.credits}편`;
}
