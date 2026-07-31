/**
 * 천장을 향한 지수 이징 — **점근할 뿐 절대 도달하지 않는다.**
 *
 * 진행 바가 이 성질에 기대고 있다. 시간으로 움직이는 바는 언제든 실제 진행을
 * 앞질러 거짓말이 될 수 있는데, 지수 이징은 수학적으로 천장을 넘지 못하므로
 * 추정이 짧으면 거짓말 대신 **크롤로 열화**된다. `docs/decisions.md` §2-7이
 * 지키려던 성질이 바로 이것이다.
 *
 * τ는 `expectedMs`에서 갭의 ~95%를 지나도록 잡는다 (1 - e^(-3) ≈ 0.9502).
 *
 * `progress`를 1 미만으로 명시적으로 클램프한다 — 경과 시간이 아주 크면
 * `Math.exp(-x)`가 부동소수점 언더플로로 정확히 0이 되어 progress가 정확히
 * 1이 되고, 반환값이 ceiling과 정확히 같아진다(천장 불가침 위반). 실사용
 * 범위(expectedMs는 초~분 단위)에서는 절대 발동하지 않는 안전장치다.
 */
export function easeToward(
  from: number,
  ceiling: number,
  elapsedMs: number,
  expectedMs: number,
): number {
  if (ceiling <= from) return from;
  if (!(expectedMs > 0)) return from;
  const tau = expectedMs / 3;
  const raw = 1 - Math.exp(-Math.max(0, elapsedMs) / tau);
  const progress = Math.min(raw, 0.999999);
  return from + (ceiling - from) * progress;
}
