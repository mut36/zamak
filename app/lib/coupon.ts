/**
 * 쿠폰 코드 정규화 — `normalize_coupon_code`(0014)와 **같은 규칙**이다.
 *
 * 두 곳에 같은 규칙을 두는 이유: 화면은 사용자가 입력하는 즉시 정규화된 코드를
 * 보여줘야 하고(공백을 흘린 채 "코드가 틀렸다"고 말하면 사용자가 이유를
 * 모른다), 서버는 클라이언트가 정규화를 했다고 믿을 수 없다. 신뢰하는 쪽은
 * 언제나 DB다.
 *
 * 한글에 대문자 규칙은 무해하고, 영문 코드를 섞어 발행할 때를 위해 남긴다.
 * 실제 목적은 모바일 IME와 붙여넣기가 흘리는 공백·NFD 자모의 흡수다.
 */
export function normalizeCouponCode(raw: string): string {
  return raw.normalize('NFC').replace(/\s/g, '').toUpperCase();
}

/**
 * `redeem_coupon`이 돌려주는 세 가지 결말.
 *
 * `invalid`는 "없는 코드 / 회수된 코드 / 수명이 끝난 코드 / 정원이 찬 코드"를
 * 전부 뭉뚱그린 값이다 — 존재 여부를 구분해 알려주면 그게 곧 열거 힌트다.
 */
export type CouponRedeemStatus = 'ok' | 'already_redeemed' | 'invalid';

const STATUSES: readonly string[] = ['ok', 'already_redeemed', 'invalid'];

/** DB가 모르는 상태를 뱉어도 화면이 깨지지 않도록 경계에서 좁힌다. */
export function isCouponRedeemStatus(
  value: unknown,
): value is CouponRedeemStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}
