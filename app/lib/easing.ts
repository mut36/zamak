/**
 * 천장을 향한 이징 — **점근할 뿐 절대 도달하지 않는다.**
 *
 * 진행 바가 이 성질에 기대고 있다. 시간으로 움직이는 바는 언제든 실제 진행을
 * 앞질러 거짓말이 될 수 있는데, 이 곡선은 수학적으로 천장을 넘지 못하므로
 * 추정이 짧으면 거짓말 대신 **크롤로 열화**된다. `docs/decisions.md` §2-7이
 * 지키려던 성질이 바로 이것이다.
 *
 * 곡선은 두 구간이다:
 *
 *   t < D :  p = K · (t/D)                     선형
 *   t ≥ D :  p = 1 − (1−K) · e^(−(t−D)/D)      크롤
 *
 * 옛 곡선은 전 구간 지수(`1 − e^(−3t/D)`)였다. 그건 t=0에서 가장 빨라서 flash
 * 20초 런이 2초 만에 갭의 26%를 지나갔다 — 사용자에겐 "시작하자마자 사십몇
 * 프로"로 보인다. 앞쏠림은 §6-5가 노린 성질이 아니라 지수 곡선에 딸려온
 * 부작용이었다. 천장 불가침만 남기고 앞쏠림은 버린다.
 *
 * K를 1이 아니라 0.9로 두는 건 남은 10%를 **청크가 실제로 착지할 자리**로
 * 비워두기 위해서다. 이 자리가 좁으면 착지가 늦을 때 바가 천장에 붙어 죽는다.
 */
const K = 0.9;

export function easeToward(
  from: number,
  ceiling: number,
  elapsedMs: number,
  expectedMs: number,
): number {
  if (ceiling <= from) return from;
  if (!(expectedMs > 0)) return from;
  const t = Math.max(0, elapsedMs);
  // 두 식은 t=D에서 모두 K를 주므로 이음매가 연속이다.
  const raw =
    t < expectedMs
      ? K * (t / expectedMs)
      : 1 - (1 - K) * Math.exp(-(t - expectedMs) / expectedMs);
  // 경과가 아주 크면 Math.exp가 부동소수 언더플로로 정확히 0이 되어 raw가
  // 정확히 1이 된다(천장 불가침 위반). 실사용 범위에선 발동하지 않는 가드다.
  const progress = Math.min(raw, 0.999999);
  return from + (ceiling - from) * progress;
}

/**
 * 이미 일어난 진행(floor)이 뛸 때, 점프 대신 짧게 미끄러지는 값.
 *
 * `easeToward`와 반대로 **목표에 정확히 도달한다.** floor는 추정이 아니라
 * 실제로 착지한 청크가 만든 값이라 점근할 이유가 없다 — 바꾸는 건 도달
 * 여부가 아니라 도달하는 모양이다.
 *
 * 이게 필요한 이유: Pro 1,124블록 런은 청크 5개가 전부 한 웨이브라
 * `onCompleted`가 끝에 몰려서 불린다. floor를 즉시 반영하면 바가 한 번에
 * 뛴다 — 사용자에겐 "확 구십몇 프로로 점프"로 보인다.
 *
 * 목표가 시작점보다 낮으면 시작점을 돌려준다. 바는 뒤로 가지 않는다.
 */
export function catchupValue(
  from: number,
  to: number,
  elapsedMs: number,
  catchupMs: number,
): number {
  if (to <= from) return from;
  if (!(catchupMs > 0)) return to;
  const progress = Math.min(1, Math.max(0, elapsedMs) / catchupMs);
  return from + (to - from) * progress;
}
