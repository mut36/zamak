import { parseSrtBlocks } from './srt';
import type { TargetLangCode } from '../config/languages';

/**
 * 자막이 무슨 언어인지 코드로 알아낸다 — `/polish`가 사용자에게 언어를 안 묻기
 * 위해서.
 *
 * 규칙 적용은 언어를 **반드시** 알아야 한다. 한 줄 상한(한국어 18자 / 라틴계
 * 42자)도, 문장 끝 마침표를 뗄지 말지도(한국어는 떼고 라틴계는 유지) 언어가
 * 정한다. 영어 자막을 한국어로 알고 돌리면 모든 마침표가 사라진다.
 *
 * 그런데 **그걸 사용자가 알려줄 필요는 없다.** 자막 파일 한 개에는 대사가
 * 수백 줄 있고, 그 정도면 문자 체계와 기능어만으로 충분히 갈린다. AI를 부르지
 * 않으므로 비용이 없고 결정적이라 테스트로 고정할 수 있다.
 *
 * **틀릴 수 있다는 것을 화면이 숨기지 않는다**(불변식 5의 정신). 감지 결과는
 * 완료 화면에 그대로 뜨고 다른 언어로 다시 적용할 수 있다.
 */

/** 감지 결과. `null`은 "판단할 근거가 없다"(빈 파일, 숫자만 있는 자막 등). */
export type DetectedLang = TargetLangCode | null;

const HANGUL = /[가-힣]/g;
const KANA = /[぀-ヿ]/g;
const HAN = /[一-鿿]/g;
const LATIN = /[A-Za-zÀ-ÿ]/g;

/**
 * 라틴계 언어를 가르는 기능어. 내용어가 아니라 **문법**을 고르는 이유는 장르에
 * 흔들리지 않기 때문이다 — 어떤 영화든 관사와 접속사는 나온다.
 *
 * 단어 경계로만 세므로 `di`가 `dire` 안에서 걸리지 않는다. 언어마다 개수를
 * 맞춰 둔 것도 의도다: 목록이 긴 언어가 자동으로 유리해지면 안 된다.
 */
const FUNCTION_WORDS: Record<string, string[]> = {
  en: ['the', 'and', 'you', 'that', 'what', 'with', 'this', 'have'],
  it: ['che', 'non', 'per', 'sono', 'della', 'questo', 'come', 'più'],
  es: ['que', 'los', 'una', 'por', 'con', 'para', 'está', 'pero'],
  fr: ['que', 'les', 'vous', 'pour', 'dans', 'pas', 'est', 'être'],
  de: ['der', 'die', 'und', 'ist', 'nicht', 'mit', 'ein', 'auch'],
};

/**
 * 그 언어에만 있는 글자. 기능어가 팽팽할 때 갈라 준다 — 특히 `que`를 나눠 쓰는
 * 스페인어·프랑스어, `che`가 겹치지 않는 대신 어미가 비슷한 이탈리아어.
 */
const SIGNATURE_CHARS: Record<string, RegExp> = {
  es: /[ñ¿¡]/g,
  fr: /[çœàèùâêîôû]/g,
  de: /[ßäöü]/g,
  it: /[àèéìòù]/g,
};

/** 본문만 — 번호와 타임코드는 어느 언어에서나 똑같아서 판정을 흐린다. */
function subtitleText(srt: string): string {
  return parseSrtBlocks(srt)
    .map((raw) => raw.split('\n').slice(2).join(' '))
    .join('\n')
    .replace(/<[^>]+>/g, ' ');
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * 자막 본문의 언어. 못 고르면 `null`이다 — 호출부가 "모르겠다"를 사용자에게
 * 말할 수 있어야 하므로, 아무거나 찍어 주지 않는다.
 *
 * 순서가 곧 신뢰도다. 문자 체계는 거의 틀리지 않으므로 먼저 보고, 라틴 문자일
 * 때만 기능어를 센다.
 *
 * - 한글이 보이면 **한국어**. 한국어 자막에는 영어 고유명사가 흔히 섞이지만
 *   그 반대는 드물다 — 그래서 비율이 아니라 존재로 판정한다.
 * - 가나가 보이면 **일본어**(한자가 섞여 있어도 가나가 일본어를 확정한다).
 * - 가나 없이 한자만이면 **중국어**.
 * - 그 밖에는 라틴계 다섯 중 점수가 가장 높은 것. 1등이 2등을 확실히 앞서지
 *   못하면 `null`을 준다 — 애매한 채로 마침표 정책을 고르는 것보다 묻는 게 낫다.
 */
export function detectSubtitleLanguage(srt: string): DetectedLang {
  const text = subtitleText(srt);
  if (!text.trim()) return null;

  if (count(text, HANGUL) > 0) return 'ko';
  if (count(text, KANA) > 0) return 'ja';
  if (count(text, HAN) > 0) return 'zh';

  const latin = count(text, LATIN);
  if (latin < 20) return null;

  const lower = text.toLowerCase();
  const words = lower.match(/[a-zà-ÿ']+/g) ?? [];
  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  const scores = Object.entries(FUNCTION_WORDS).map(([code, list]) => {
    const hits = list.reduce(
      (sum, word) => sum + (frequency.get(word) ?? 0),
      0,
    );
    const signature = SIGNATURE_CHARS[code]
      ? count(lower, SIGNATURE_CHARS[code])
      : 0;
    // 특수 글자는 흔치 않아 그대로 더하면 묻힌다. 기능어 한 번의 두 배로 친다 —
    // `ñ` 하나는 `que` 열 번만큼은 아니어도 `que` 한 번보다는 강한 증거다.
    return { code, score: hits + signature * 2 };
  });

  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;

  // 근거가 너무 적거나 1·2등이 붙어 있으면 고르지 않는다.
  if (best.score < 3) return null;
  if (best.score < second.score * 1.5) return null;

  return best.code as TargetLangCode;
}
