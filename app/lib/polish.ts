import {
  parseBlockTiming,
  parseSrtBlocks,
  readBlockIndex,
  visibleLength,
} from './srt';

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
