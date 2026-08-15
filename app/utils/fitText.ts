import type { CSSProperties } from 'react';

/**
 * 카피에 손으로 넣은 `\n`을, 화면이 좁아져도 **풀지 않고 지키기** 위한 계수.
 *
 * 예전에는 640px 아래에서 `\n`을 공백으로 풀었다(`whitespace-normal
 * sm:whitespace-pre-line`). 그러면 폰에서는 손으로 잡은 문장 리듬이 통째로
 * 사라지고, 640px~데스크톱 사이에서는 `\n`이 살아 있는 채로 그 줄이 또 접혀
 * 한 어절짜리 고아 줄이 생겼다.
 *
 * 지금은 줄바꿈을 지키고 **글자 크기를 줄인다**. 한글은 글자폭이 대략 1em이라
 * 한 줄을 통째로 넣는 데 필요한 글자 크기는 곧 `가용 폭 ÷ 그 줄의 폭(em)`이다.
 * 그 "줄의 폭"이 여기서 재는 값이고, `.lp-fit`(globals.css)이 나눗셈을 한다.
 * 더 줄이면 못 읽는 하한(`--fit-min`)에 닿으면 거기서 멈추고, 그때부터는
 * 브라우저 줄바꿈에 맡긴다.
 */

/**
 * 전각으로 치는 글자 — 한글(자모·완성형), CJK 한자·가나, 전각 부호.
 * 나머지(라틴·숫자·공백·반각 부호)는 대략 절반으로 센다. 폰트마다 다르지만
 * 이 값은 "글자 크기를 얼마나 줄일까"의 기준일 뿐이라 근사로 충분하다.
 */
const WIDE_CHAR =
  /[ᄀ-ᇿ⺀-〿㄰-㆏㐀-䶿一-鿿가-힯豈-﫿＀-｠￠-￦]/;

/** 가장 긴 줄의 대략적인 가로폭(em 단위). */
export function fitEm(text: string): number {
  // `*`는 강조 구간을 표시하는 마커라 화면에 찍히지 않는다(히어로 부제).
  const lines = text.replace(/\*/g, '').split('\n');
  let widest = 0;
  for (const line of lines) {
    let w = 0;
    for (const ch of line.trim()) w += WIDE_CHAR.test(ch) ? 1 : 0.5;
    if (w > widest) widest = w;
  }
  // 0으로 나누지 않게. 빈 문자열이면 크기를 줄일 이유도 없다.
  return widest || 1;
}

/**
 * `.lp-fit`이 읽는 커스텀 프로퍼티를 만든다. 크기 범위(`--fit-min`/`--fit-max`)는
 * 요소의 클래스가 CSS에서 정하므로 여기서는 계수만 넘긴다.
 *
 * @param extra 같은 요소에 이미 붙는 스타일(리빌 지연 등)과 합칠 때.
 */
export function fitVars(text: string, extra?: CSSProperties): CSSProperties {
  return {
    ...extra,
    '--fit': fitEm(text).toFixed(1),
  } as CSSProperties;
}
