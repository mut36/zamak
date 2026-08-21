/**
 * 가격표 — **표시 전용**이다. 결제 로직은 이 파일을 읽지 않는다.
 *
 * 왜 `feature/payments`의 `app/config/packs.ts`를 쓰지 않나: 그 파일은 §6-2로
 * 결제를 분리하기 전에 쓰인 **단일 크레딧 모델**이라 라이트/프로 분리(§5-1)를
 * 모른다. main에 그대로 가져오면 화면이 존재하지 않는 상품을 판다.
 *
 * ⚠️ **결제를 열 때 `packs.ts`가 가격의 원본이 된다.** 금액은 서버가
 * `/api/payments/prepare`에서 주문 행에 박아야 조작이 막히기 때문이다. 그때
 * 이 파일은 지우고 화면이 `packs.ts`를 읽게 바꾼다 — 두 표를 남겨두면 한쪽만
 * 고쳐져 화면 가격과 청구 금액이 갈라진다. (`docs/TODO.md` 결제 오픈 항목)
 *
 * ⚠️ **아래 금액은 임시값이다.** 2026-08-21 PG 재심사에 상품·가격 화면이
 * 필요해서 자리를 먼저 만든 것이고, 확정 전에 바꾼다. 다만 아무 숫자나 넣어도
 * 되는 건 아니다 — 편당 단가가 원가 천장을 넘어야 한다. `constants.ts`
 * `MAX_BLOCKS_PER_CREDIT` 주석의 실측이 상한이다(프로 2,000블록 ≈ 2,670원).
 */
export interface PricingPack {
  id: string;
  /** 번역권 개수. 1편 = 자막 파일 1개. */
  credits: number;
  /** 원, 부가세 포함. */
  amount: number;
  /** 리본 — 티어당 최대 하나. */
  badge?: string;
}

export interface PricingTier {
  id: 'lite' | 'pro';
  packs: readonly PricingPack[];
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'lite',
    packs: [
      { id: 'lite-3', credits: 3, amount: 2_900 },
      { id: 'lite-10', credits: 10, amount: 7_900, badge: '가장 많이 골라요' },
      { id: 'lite-30', credits: 30, amount: 18_900 },
    ],
  },
  {
    id: 'pro',
    packs: [
      { id: 'pro-3', credits: 3, amount: 14_900 },
      { id: 'pro-10', credits: 10, amount: 39_900, badge: '가장 많이 골라요' },
      { id: 'pro-30', credits: 30, amount: 99_000 },
    ],
  },
] as const;

/** 편당 단가 — "편당 N원" 줄에 쓴다. */
export function pricePerCredit(pack: PricingPack): number {
  return Math.round(pack.amount / pack.credits);
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR');
}
