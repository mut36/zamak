import {
  adjustSubtitleTimingWithReport,
  enforceTextRules,
  parseBlockTiming,
  parseSrtBlocks,
  readBlockIndex,
  visibleLength,
  type TextRuleReport,
} from './srt';
import type { TargetLang } from '../config/languages';
import {
  MIN_SUBTITLE_DURATION_MS,
  MIN_SUBTITLE_GAP_MS,
} from '../config/constants';

/**
 * 사용자가 고른 읽기 속도 밴드. 없으면(`undefined`) 타임코드를 아예 안 건드린다 —
 * 이 경로의 기본값이자 원래 약속이다.
 *
 * 이름은 화면 문구(최소·최대)가 아니라 엔진의 말로 적는다. 화면에서 말하는
 * "최대"는 손댈지 말지를 가르는 **발동선**(`cpsHardMax`)이고, "최소"는 손댄
 * 자막이 내려앉는 **착지점**(`cpsTarget`)이다. 원래 최소보다 느리게 읽히는
 * 자막은 그대로 둔다 — 이 파이프라인은 노출을 넓히기만 하고 깎지 않는다.
 */
export interface PolishTimingOptions {
  cpsTarget: number;
  cpsHardMax: number;
}

export interface OverLongCollection {
  /**
   * 초과 블록만 담은, 그 자체로 유효한 SRT. 원본의 번호와 타임코드를 그대로
   * 들고 온다 — 그래서 `reassembleTranslatedChunk`가 이것을 평범한 청크로
   * 취급할 수 있다. 번호가 연속이 아니어도 상관없다(`parseSrtBlocks`는 빈
   * 줄로만 나누고, 재조립은 위치가 아니라 번호로 대조한다).
   */
  subset: string;
  /** 위 블록들의 번호, 파일 순서대로. */
  indices: number[];
}

/**
 * 한 줄이라도 `lineMaxChars`를 넘는 블록을 골라낸다.
 *
 * 이 함수가 AI에 보낼 대상을 정한다 — 실측(1,126블록)에서 19자 초과는 3.8%였고,
 * ZAMAK이 번역한 결과를 다시 넣으면 대개 0건이다. 그때 호출부는 모델을 아예
 * 부르지 않는다. 이것이 이 기능을 무료로 낼 수 있는 근거다.
 *
 * 타임코드가 없거나 번호를 못 읽는 블록은 건너뛴다 — 되돌려 놓을 주소가 없으므로
 * 보내봐야 결과를 제자리에 꽂을 수 없다.
 */
export function collectOverLongBlocks(
  srt: string,
  lineMaxChars: number,
): OverLongCollection {
  const subset: string[] = [];
  const indices: number[] = [];

  for (const raw of parseSrtBlocks(srt)) {
    if (!parseBlockTiming(raw)) continue;

    const index = readBlockIndex(raw);
    if (index === null) continue;

    const body = raw.split('\n').slice(2);
    if (!body.some((line) => visibleLength(line) > lineMaxChars)) continue;

    subset.push(raw);
    indices.push(index);
  }

  return { subset: subset.join('\n\n'), indices };
}

/**
 * 재조립된 부분집합을 전체 파일의 제자리에 되돌린다.
 *
 * **블록 수 보존이 구조적으로 보장된다**: 전체를 `map`으로 훑으며 번호가 일치할
 * 때만 통째로 갈아끼우므로, 블록을 더하거나 뺄 경로 자체가 없다. `rebuiltSubset`이
 * 쓰레기여도 최악의 결과는 "아무것도 안 바뀜"이다. 타임코드 역시 교체 블록이
 * 원본에서 온 것이라(재조립이 소스의 타임라인을 쓴다) 이 경로에서 바뀔 수 없다.
 */
export function spliceBlocks(fullSrt: string, rebuiltSubset: string): string {
  const replacements = new Map<number, string>();
  for (const raw of parseSrtBlocks(rebuiltSubset)) {
    const index = readBlockIndex(raw);
    if (index !== null) replacements.set(index, raw);
  }

  if (replacements.size === 0) return fullSrt;

  return parseSrtBlocks(fullSrt)
    .map((raw) => {
      const index = readBlockIndex(raw);
      if (index === null) return raw;
      return replacements.get(index) ?? raw;
    })
    .join('\n\n');
}

export interface PolishSummary extends TextRuleReport {
  /** 상한을 넘었다가 실제로 해소된 블록 수. */
  linesSplit: number;
  /**
   * 노출 시간이 실제로 넓어진 자막 수. 사용자가 읽기 속도 밴드를 고르지 않았으면
   * 언제나 0이다(타임코드를 건드리는 경로 자체가 안 열린다).
   */
  timingAdjusted: number;
  /**
   * 상한을 넘었는데 끝내 안 나뉜 블록 수(청크 실패, 끊을 자리 없음 등).
   *
   * **화면에 안 띄운다**(2026-08-19 제품 결정). 개수만 알려주고 어느 자막인지는
   * 못 알려주는 고지는 불안만 주고 행동은 못 하게 한다 — 띄우려면 번호까지
   * 같이 줘야 한다. 지금은 `linesSplit`을 구하는 데 쓰이고, 파이프라인이
   * 제대로 도는지 보는 테스트 신호로 남아 있다(`polish.test.ts`).
   */
  unsplitLines: number;
}

export interface PolishOutcome {
  content: string;
  summary: PolishSummary;
}

function addReports(a: TextRuleReport, b: TextRuleReport): TextRuleReport {
  return {
    ellipsisNormalized: a.ellipsisNormalized + b.ellipsisNormalized,
    linesMerged: a.linesMerged + b.linesMerged,
    trailingPunctuationStripped:
      a.trailingPunctuationStripped + b.trailingPunctuationStripped,
    linesJoined: a.linesJoined + b.linesJoined,
    midLinePeriodsToCommas: a.midLinePeriodsToCommas + b.midLinePeriodsToCommas,
    speakerLinesSplit: a.speakerLinesSplit + b.speakerLinesSplit,
    speakerDashesNormalized:
      a.speakerDashesNormalized + b.speakerDashesNormalized,
  };
}

/**
 * `/polish`의 파이프라인 전체 — 파일 입출력과 상태를 뺀 순수한 부분.
 *
 * 훅에서 뽑아낸 이유는 `useWizard`가 `countBlocks`·`exceedsCreditCap`을 뽑아낸
 * 이유와 같다: 여기 담긴 판단들은 렌더 없이 검증할 수 있어야 한다. 특히
 * **초과가 0건이면 `splitLongLines`를 아예 안 부른다**는 성질은 이 기능을 무료로
 * 낼 수 있는 근거이므로 테스트가 지켜야 한다.
 *
 * `splitLongLines`를 주입받는 것은 그 성질을 관찰 가능하게 만들기 위해서다 —
 * 호출 여부가 곧 비용이다.
 *
 * **`timing`을 안 주면 타임코드를 읽지도 쓰지도 않는다** — 이 화면의 기본값이다.
 * 주면 마지막 단계에서 딱 한 번 `adjustSubtitleTimingWithReport`를 태운다.
 * 순서가 중요하다: 마침표 제거·두 줄 접기로 **글자 수가 확정된 뒤**라야 CPS가
 * 맞다. 규칙 적용 전 글자 수로 재면 이미 사라질 마침표까지 세고 넓힌다.
 */
export async function applySubtitleRules(
  srt: string,
  lang: TargetLang,
  splitLongLines: (subset: string) => Promise<string>,
  timing?: PolishTimingOptions | null,
): Promise<PolishOutcome> {
  const ruleOptions = {
    trailingPunctuation: lang.trailingPunctuation,
    lineMaxChars: lang.lineMaxChars,
    ellipsis: lang.ellipsis,
  };

  // 1차 — 코드가 결정적으로 처리하는 전부.
  const first = enforceTextRules(srt, ruleOptions);

  const { subset, indices } = collectOverLongBlocks(
    first.content,
    lang.lineMaxChars,
  );

  // 초과가 없으면 모델을 부르지 않는다. ZAMAK이 번역한 자막을 다시 넣으면
  // 대개 이 경로이고, 그때 이 기능은 비용 0에 즉시 끝난다.
  let merged = first.content;
  if (indices.length > 0) {
    merged = spliceBlocks(first.content, await splitLongLines(subset));
  }

  // 2차 — 모델이 나눈 결과에 2줄 상한·접기·마침표를 다시 적용.
  const second = enforceTextRules(merged, ruleOptions);

  // 남은 초과는 **최종 결과물**에서 센다. 2차가 마침표를 떼며 상한 아래로
  // 내려오는 블록이 있어, 병합 직후에 세면 성공을 과소 집계한다.
  const unsplitLines = collectOverLongBlocks(
    second.content,
    lang.lineMaxChars,
  ).indices.length;

  // 타임코드는 여기서만, 그리고 사용자가 명시적으로 켰을 때만 바뀐다.
  const timed = timing
    ? adjustSubtitleTimingWithReport(second.content, {
        cpsTarget: timing.cpsTarget,
        cpsHardMax: timing.cpsHardMax,
        minGapMs: MIN_SUBTITLE_GAP_MS,
        minDurationMs: MIN_SUBTITLE_DURATION_MS,
      })
    : { content: second.content, adjusted: 0 };

  return {
    content: timed.content,
    summary: {
      ...addReports(first.report, second.report),
      timingAdjusted: timed.adjusted,
      // 2차의 3줄→2줄 병합이 새로 긴 줄을 만들 수 있어 unsplitLines가 원래 초과
      // 수를 넘길 수 있다. 요약에 음수가 뜨는 것보다 0이 정직하다.
      linesSplit: Math.max(0, indices.length - unsplitLines),
      unsplitLines,
    },
  };
}
