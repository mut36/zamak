import { parseSrtBlocks, readBlockIndex } from './srt';

/**
 * 줄바꿈 모델이 **대사를 고치지 못하게** 막는 검사.
 *
 * `/polish`의 줄바꿈 호출은 모델에게 딱 한 가지 권한만 준다 — 어디서 끊을지
 * 정하는 것. 줄이는 조항은 2026-08-21에 일부러 뺐고(`decisions.md`),
 * 프롬프트의 어느 규칙도 낱말을 바꾸라고 하지 않는다. 그러니 **출력에서 줄바꿈
 * 표시와 공백을 걷어내면 입력과 글자 그대로 같아야 한다.** 안 같으면 모델이
 * 권한 밖의 일을 한 것이다.
 *
 * 이 검사가 필요한 이유는 2026-08-26에 실제로 터진 사고 때문이다. 이탈리아어
 * 자막이 한국어 설정으로 돌아 파일의 70%가 "너는 한국어 자막의 줄바꿈만
 * 담당한다"는 **한국어** 지시와 함께 모델로 갔고, 모델은 그것을 "한국어로
 * 만들라"로 읽고 **번역해서** 돌려줬다. 언어 감지(`detectLanguage.ts`)가 그
 * 원인을 없앴지만, 원인을 없애는 것과 증상이 불가능해지는 것은 다른 보장이다 —
 * 프롬프트가 바뀌거나 모델이 바뀌면 같은 일이 다시 일어날 수 있고, 그때 결과는
 * "자막이 통째로 다른 언어가 되어 나감"이다.
 *
 * 그래서 규칙 적용에서 모델이 만질 수 있는 것은 **줄이 나뉘는 자리뿐**임을
 * 코드가 강제한다. 어긴 블록은 버리고 원문을 쓴다 — 안 나뉜 긴 줄이 남는 것은
 * 이 기능이 원래 감수하는 비용이고(같은 결정 기록), 번역된 대사가 나가는 것과는
 * 비교가 안 된다.
 */

/**
 * 비교용 정규화: 공백과 줄바꿈 표시를 없앤다.
 *
 * 줄바꿈은 `|`로 오거나(현재 형식) 실제 개행으로 올 수 있고, 어느 쪽이든 이
 * 검사의 관심 밖이다. 공백을 다 지우는 이유도 같다 — 끊는 자리가 바뀌면 공백이
 * 줄바꿈으로 바뀌므로, 공백의 위치는 모델에게 허용된 변화다.
 */
function normalize(text: string): string {
  return text.replace(/[|\s]+/g, '');
}

export interface VerbatimCheck {
  /** 검사를 통과한 블록만 담은 SRT. 어긴 블록은 원문으로 되돌아간다. */
  content: string;
  /** 대사가 바뀌어 되돌린 블록 수. 0이 정상이다. */
  rejected: number;
}

/**
 * 재조립된 결과를 원본과 블록 단위로 대조해, 대사가 바뀐 블록만 원문으로
 * 되돌린다.
 *
 * 번호로 대조하므로 순서나 누락에 영향받지 않는다. 원본에 없는 번호가 결과에
 * 있으면 그 블록은 버린다 — 어디서 왔는지 알 수 없는 자막이다.
 */
export function keepVerbatimBlocks(
  source: string,
  rebuilt: string,
): VerbatimCheck {
  const sourceBlocks = new Map<number, string>();
  for (const raw of parseSrtBlocks(source)) {
    const index = readBlockIndex(raw);
    if (index !== null) sourceBlocks.set(index, raw);
  }

  let rejected = 0;
  const checked = parseSrtBlocks(rebuilt).map((raw) => {
    const index = readBlockIndex(raw);
    if (index === null) return raw;

    const original = sourceBlocks.get(index);
    if (!original) return raw;

    const before = normalize(original.split('\n').slice(2).join('\n'));
    const after = normalize(raw.split('\n').slice(2).join('\n'));
    if (before === after) return raw;

    rejected++;
    return original;
  });

  return { content: checked.join('\n\n'), rejected };
}
