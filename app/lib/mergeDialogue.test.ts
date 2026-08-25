import { describe, expect, it } from 'vitest';
import {
  applyDialogueMerges,
  collectDialogueCandidates,
  formatCandidatesForModel,
  readMergeVerdicts,
} from './mergeDialogue';
import { parseSrtBlocks } from './srt';

const LINE_MAX = 18;

/** `1\n00:00:01,000 --> 00:00:02,000\n대사` 한 블록. 시간은 초 단위로 준다. */
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

function srtOf(...blocks: string[]) {
  return blocks.join('\n\n');
}

describe('collectDialogueCandidates', () => {
  it('짧고 붙어 있는 한 줄짜리 두 블록을 후보로 뽑는다', () => {
    const srt = srtOf(
      block(1, 1, 2, '자극제?'),
      block(2, 2.2, 3, '그래'),
    );

    const candidates = collectDialogueCandidates(srt, LINE_MAX);

    expect(candidates).toEqual([
      { id: 1, firstIndex: 1, secondIndex: 2, first: '자극제?', second: '그래' },
    ]);
  });

  it('간격이 벌어지면 다른 장면일 수 있으므로 뽑지 않는다', () => {
    const srt = srtOf(block(1, 1, 2, '자극제?'), block(2, 3.5, 4, '그래'));
    expect(collectDialogueCandidates(srt, LINE_MAX)).toHaveLength(0);
  });

  it('합친 노출 구간이 상한을 넘으면 뽑지 않는다', () => {
    const srt = srtOf(block(1, 1, 5.5, '자극제?'), block(2, 6, 7, '그래'));
    expect(collectDialogueCandidates(srt, LINE_MAX)).toHaveLength(0);
  });

  it('이어지는 말이라고 표시된 줄은 뽑지 않는다', () => {
    // 쉼표·말줄임표는 "안 끝났다"는 명시적 신호다. 표시가 없는 미완결
    // (`그래서 내가` / `거기 갔지`)은 코드가 아니라 모델이 거른다 — 한국어
    // 반말은 완결돼도 아무 표시가 없어서 코드가 구분하지 못한다.
    const srt = srtOf(block(1, 1, 2, '그래서 내가,'), block(2, 2.2, 3, '갔지'));
    expect(collectDialogueCandidates(srt, LINE_MAX)).toHaveLength(0);
  });

  it('대시가 두 글자 붙었을 때 상한을 넘으면 뽑지 않는다', () => {
    // 17자 + `- ` = 19자 > 18자.
    const srt = srtOf(
      block(1, 1, 2, '이건 열일곱 자가 넘는 자막이야'),
      block(2, 2.2, 3, '그래'),
    );
    expect(collectDialogueCandidates(srt, LINE_MAX)).toHaveLength(0);
  });

  it('두 줄짜리·태그·가사·이미 대시가 있는 블록은 뽑지 않는다', () => {
    const cases = [
      block(2, 2.2, 3, '그래\n정말로'),
      block(2, 2.2, 3, '<i>그래</i>'),
      block(2, 2.2, 3, '♪ 그래 ♪'),
      block(2, 2.2, 3, '- 그래'),
      block(2, 2.2, 3, '…그래'),
    ];
    for (const second of cases) {
      const srt = srtOf(block(1, 1, 2, '자극제?'), second);
      expect(collectDialogueCandidates(srt, LINE_MAX)).toHaveLength(0);
    }
  });

  it('한 블록은 한 쌍에만 들어간다', () => {
    const srt = srtOf(
      block(1, 1, 2, '자극제?'),
      block(2, 2.2, 3, '그래'),
      block(3, 3.2, 4, '진짜?'),
    );

    const candidates = collectDialogueCandidates(srt, LINE_MAX);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].secondIndex).toBe(2);
  });
});

describe('readMergeVerdicts', () => {
  it('Y만 걷고 모르는 번호와 침묵은 버린다', () => {
    const approved = readMergeVerdicts(
      '[1] Y\n[2] N\n[9] Y\n잡소리',
      new Set([1, 2, 3]),
    );
    expect([...approved]).toEqual([1]);
  });
});

describe('applyDialogueMerges', () => {
  const srt = srtOf(
    block(1, 1, 2, '자극제?'),
    block(2, 2.2, 3, '그래'),
    block(3, 5, 6, '가자'),
  );
  const candidates = collectDialogueCandidates(srt, LINE_MAX);

  it('승인된 쌍을 대시 두 줄로 합치고 전체를 다시 번호 매긴다', () => {
    const { content, merged } = applyDialogueMerges(
      srt,
      candidates,
      new Set([1]),
    );

    expect(merged).toBe(1);
    const blocks = parseSrtBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe(
      '1\n00:00:01,000 --> 00:00:03,000\n- 자극제?\n- 그래',
    );
    // 뒤 블록의 번호가 3에서 2로 당겨진다 — 번호가 비면 안 된다.
    expect(blocks[1]).toBe('2\n00:00:05,000 --> 00:00:06,000\n가자');
  });

  it('승인이 없으면 원본을 글자 그대로 돌려준다', () => {
    const result = applyDialogueMerges(srt, candidates, new Set());
    expect(result).toEqual({ content: srt, merged: 0 });
  });
});

describe('formatCandidatesForModel', () => {
  it('쌍 번호로 주소를 매긴다', () => {
    expect(
      formatCandidatesForModel([
        { id: 1, firstIndex: 7, secondIndex: 8, first: '자극제?', second: '그래' },
      ]),
    ).toBe('[1]\nA: 자극제?\nB: 그래');
  });
});
