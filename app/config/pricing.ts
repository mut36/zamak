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
 * 금액은 2026-08-21에 확정됐다(docs/decisions.md §6-22). 근거는 **장당 마진**
 * 이고, 마진은 차감 단위가 정해져야 계산된다 — 번역권 1장 = 자막 1,200줄
 * (`constants.ts`의 `BLOCKS_PER_CREDIT`)이므로 1장의 원가는 고정이다:
 *
 *   실수취(장당) = 판매가 × (1 − 0.033) ÷ 1.10   (PG 수수료 3.3%, VAT 10%)
 *   1장 원가      = 라이트 468원 · 프로 1,740원   (글로사리 포함 보수값,
 *                   docs/tuning/cost-per-block.md의 0.39·1.45 KRW/줄 × 1,200)
 *
 * 기준가(라이트 990원 · 프로 3,300원)에서 마진은 라이트 46% · 프로 40%이고,
 * 파일이 길어져도 그 아래로 내려가지 않는다 — 2장짜리는 원가도 2배이므로
 * 비율이 그대로다. 파일 단위 차감이던 시절 프로 장편이 6%였던 문제가 여기서
 * 사라진다(§1-17).
 *
 * ⚠️ **볼륨 할인은 장당 마진 25%가 하한이다** (라이트 750원 · 프로 2,700원).
 * 그보다 내리면 1,200줄짜리 한 장에서 적자에 가까워진다. 가격을 만질 때
 * `feature/payments`의 `packs.test.ts`가 이 하한을 단언한다.
 */
export interface PricingPack {
  id: string;
  /** 번역권 장수. 1장 = 자막 1,200줄(올림 차감). */
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
      { id: 'lite-3', credits: 3, amount: 2_970 },
      { id: 'lite-10', credits: 10, amount: 9_900, badge: '가장 많이 골라요' },
      { id: 'lite-30', credits: 30, amount: 27_000 },
    ],
  },
  {
    id: 'pro',
    packs: [
      // 프로에 30장 팩은 두지 않는다. 30장까지 할인을 이어가면 장당 단가가
      // 마진 하한(2,700원) 밑으로 내려가고, 그 아래로 파는 것이 §6-22가
      // 명시적으로 범위 밖에 둔 '볼륨 할인 확대'다.
      { id: 'pro-3', credits: 3, amount: 9_900 },
      { id: 'pro-10', credits: 10, amount: 29_000, badge: '가장 많이 골라요' },
    ],
  },
] as const;

/** 장당 단가 — "장당 N원" 줄에 쓴다. */
export function pricePerCredit(pack: PricingPack): number {
  return Math.round(pack.amount / pack.credits);
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR');
}
