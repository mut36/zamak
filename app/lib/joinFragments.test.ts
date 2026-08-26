import { describe, expect, it } from 'vitest';
import {
  applyFragmentJoins,
  collectFragmentRuns,
  formatRunsForModel,
  readJoinGroups,
} from './joinFragments';
import { parseSrtBlocks } from './srt';

const LINE_MAX = 18;

/** 자동자막처럼 촘촘히 이어지는 블록. 시간은 초 단위. */
function block(index: number, start: number, end: number, body: string) {
  const stamp = (seconds: number) => {
    const whole = Math.floor(seconds);
    const millis = Math.round((seconds - whole) * 1000);
    const mm = String(Math.floor(whole / 60)).padStart(2, '0');
    const ss = String(whole % 60).padStart(2, '0');
    return `00:${mm}:${ss},${String(millis).padStart(3, '0')}`;
  };
  return `${index}\n${stamp(start)} --> ${stamp(end)}\n${body}`;
}

const srtOf = (...blocks: string[]) => blocks.join('\n\n');

/** `그래서 / 내가 / 거기 갔어 / 근데 / 아무도 없더라` — 0.1초 간격. */
const FRAGMENTS = srtOf(
  block(1, 1.0, 1.4, '그래서'),
  block(2, 1.5, 1.9, '내가'),
  block(3, 2.0, 2.6, '거기 갔어'),
  block(4, 2.7, 3.0, '근데'),
  block(5, 3.1, 3.8, '아무도 없더라'),
);

describe('collectFragmentRuns', () => {
  it('촘촘히 이어지는 블록을 한 런으로 묶는다', () => {
    const runs = collectFragmentRuns(FRAGMENTS, LINE_MAX);

    expect(runs).toHaveLength(1);
    expect(runs[0].indices).toEqual([1, 2, 3, 4, 5]);
    expect(runs[0].lines).toEqual([
      '그래서',
      '내가',
      '거기 갔어',
      '근데',
      '아무도 없더라',
    ]);
  });

  it('간격이 벌어지면 런을 끊는다', () => {
    // 3번과 4번 사이가 1초 — 문장이 끝나고 숨을 쉰 자리다.
    const srt = srtOf(
      block(1, 1.0, 1.4, '그래서'),
      block(2, 1.5, 1.9, '내가'),
      block(3, 2.0, 2.6, '거기 갔어'),
      block(4, 3.6, 4.0, '근데'),
      block(5, 4.1, 4.8, '아무도 없더라'),
    );

    const runs = collectFragmentRuns(srt, LINE_MAX);

    expect(runs.map((run) => run.indices)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it('혼자 남는 블록은 런이 아니다', () => {
    const srt = srtOf(block(1, 1, 1.4, '그래서'), block(2, 5, 5.4, '내가'));
    expect(collectFragmentRuns(srt, LINE_MAX)).toHaveLength(0);
  });

  it('대사가 아닌 블록에서 런이 끊긴다', () => {
    const srt = srtOf(
      block(1, 1.0, 1.4, '그래서'),
      block(2, 1.5, 1.9, '♪ 노래 ♪'),
      block(3, 2.0, 2.6, '거기 갔어'),
    );
    expect(collectFragmentRuns(srt, LINE_MAX)).toHaveLength(0);
  });
});

describe('readJoinGroups', () => {
  const runs = collectFragmentRuns(FRAGMENTS, LINE_MAX);

  it('연속 범위만 걷는다', () => {
    const groups = readJoinGroups('[1] 1-3, 4-5', runs);
    expect(groups.get(1)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it('겹치거나 범위를 벗어난 묶음은 버린다', () => {
    // 2-4는 1-3과 겹치고, 4-9는 런 밖이다.
    const groups = readJoinGroups('[1] 1-3, 2-4, 4-9', runs);
    expect(groups.get(1)).toEqual([[1, 2, 3]]);
  });

  it('답이 없거나 `-`면 아무것도 안 잇는다', () => {
    expect(readJoinGroups('[1] -', runs).size).toBe(0);
    expect(readJoinGroups('', runs).size).toBe(0);
    expect(readJoinGroups('[9] 1-2', runs).size).toBe(0);
  });
});

describe('applyFragmentJoins', () => {
  const runs = collectFragmentRuns(FRAGMENTS, LINE_MAX);

  it('묶음마다 한 줄로 잇고 타임코드는 처음~끝으로 준다', () => {
    const groups = readJoinGroups('[1] 1-3, 4-5', runs);

    const { content, joined } = applyFragmentJoins(
      FRAGMENTS,
      runs,
      groups,
      LINE_MAX,
    );

    // 5블록 → 2블록: 사라진 블록은 3개다.
    expect(joined).toBe(3);
    const blocks = parseSrtBlocks(content);
    expect(blocks).toEqual([
      '1\n00:00:01,000 --> 00:00:02,600\n그래서 내가 거기 갔어',
      '2\n00:00:02,700 --> 00:00:03,800\n근데 아무도 없더라',
    ]);
  });

  it('한 자막에 안 들어가는 묶음은 그 묶음만 버린다', () => {
    // 다섯을 통째로 이으면 20자 — 두 줄(36자) 안이라 통과해야 하므로,
    // 천장을 한 줄로 낮춰 거부를 확인한다(lineMaxChars 8 → 16자 천장).
    const groups = readJoinGroups('[1] 1-5', runs);

    const { content, joined } = applyFragmentJoins(FRAGMENTS, runs, groups, 8);

    expect(joined).toBe(0);
    expect(content).toBe(FRAGMENTS);
  });

  it('노출이 7초를 넘는 묶음도 버린다', () => {
    const long = srtOf(
      block(1, 1, 4, '그래서'),
      block(2, 4.2, 9, '내가 거기 갔어'),
    );
    const longRuns = collectFragmentRuns(long, LINE_MAX);
    const groups = readJoinGroups('[1] 1-2', longRuns);

    expect(
      applyFragmentJoins(long, longRuns, groups, LINE_MAX).joined,
    ).toBe(0);
  });

  it('묶음이 없으면 원본을 글자 그대로 돌려준다', () => {
    const result = applyFragmentJoins(FRAGMENTS, runs, new Map(), LINE_MAX);
    expect(result).toEqual({ content: FRAGMENTS, joined: 0 });
  });
});

describe('formatRunsForModel', () => {
  it('런 안의 자리로 번호를 매긴다 — 자막 번호가 아니라', () => {
    const runs = collectFragmentRuns(
      srtOf(block(7, 1.0, 1.4, '그래서'), block(8, 1.5, 1.9, '내가')),
      LINE_MAX,
    );

    expect(formatRunsForModel(runs)).toBe('[1]\n1. 그래서\n2. 내가');
  });
});
