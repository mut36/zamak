import { describe, expect, it, vi } from 'vitest';
import {
  applySubtitleRules,
  collectOverLongBlocks,
  spliceBlocks,
} from './polish';
import { parseSrtBlocks } from './srt';
import { resolveTargetLang } from '../config/languages';

const block = (n: number, body: string) =>
  `${n}\n00:00:0${n},000 --> 00:00:0${n},900\n${body}`;

describe('collectOverLongBlocks', () => {
  it('19자를 넘는 줄이 있는 블록만 고른다', () => {
    const srt = [
      block(1, '짧은 줄'),
      block(2, '스무 글자가 넘어가는 아주 기다란 자막 한 줄'),
      block(3, '이것도 짧다'),
    ].join('\n\n');

    const { subset, indices } = collectOverLongBlocks(srt, 19);

    expect(indices).toEqual([2]);
    expect(parseSrtBlocks(subset)).toHaveLength(1);
    expect(subset).toContain('00:00:02,000 --> 00:00:02,900');
  });

  it('두 줄 중 한 줄만 넘어도 고른다', () => {
    const srt = block(1, '짧은 줄\n스무 글자가 넘어가는 아주 기다란 자막 한 줄');
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([1]);
  });

  it('길이는 마크업을 뺀 글자 수로 잰다', () => {
    const srt = block(1, `<i>${'가'.repeat(19)}</i>`);
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([]);
  });

  it('초과가 없으면 빈 결과를 준다', () => {
    const srt = [block(1, '짧다'), block(2, '이것도')].join('\n\n');
    expect(collectOverLongBlocks(srt, 19)).toEqual({ subset: '', indices: [] });
  });

  it('타임코드가 없는 블록은 건너뛴다', () => {
    const srt = `1\n망가진 헤더\n${'가'.repeat(30)}`;
    expect(collectOverLongBlocks(srt, 19).indices).toEqual([]);
  });

  it('고른 블록은 원본 번호와 타임코드를 그대로 들고 온다', () => {
    // 번호가 연속이 아니어도 유효한 청크여야 한다 — reassembleTranslatedChunk가
    // 위치가 아니라 번호로 대조하기 때문에 이게 성립한다.
    const long = '스무 글자가 넘어가는 아주 기다란 자막 한 줄';
    const srt = [block(1, long), block(2, '짧다'), block(3, long)].join('\n\n');

    const { subset, indices } = collectOverLongBlocks(srt, 19);

    expect(indices).toEqual([1, 3]);
    const blocks = parseSrtBlocks(subset);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].split('\n')[0]).toBe('1');
    expect(blocks[1].split('\n')[0]).toBe('3');
  });
});

describe('spliceBlocks', () => {
  const full = [block(1, '하나'), block(2, '둘'), block(3, '셋')].join('\n\n');

  it('번호가 같은 블록만 갈아끼운다', () => {
    const rebuilt = block(2, '둘\n나뉜 줄');
    const result = spliceBlocks(full, rebuilt);

    expect(result).toContain('둘\n나뉜 줄');
    expect(result).toContain('하나');
    expect(result).toContain('셋');
  });

  it('무슨 입력이 와도 블록 수가 변하지 않는다', () => {
    for (const rebuilt of [
      '',
      block(2, '바뀐 본문'),
      block(99, '없는 번호'),
      [block(1, 'A'), block(2, 'B'), block(3, 'C')].join('\n\n'),
      '쓰레기 입력',
    ]) {
      expect(parseSrtBlocks(spliceBlocks(full, rebuilt))).toHaveLength(3);
    }
  });

  it('모르는 번호는 무시한다', () => {
    expect(spliceBlocks(full, block(99, '유령'))).toBe(full);
  });

  it('타임코드는 원본 그대로 남는다', () => {
    const result = spliceBlocks(full, block(2, '바뀐 본문'));
    expect(result).toContain('00:00:02,000 --> 00:00:02,900');
  });

  it('순서가 뒤섞여 와도 제자리에 꽂는다', () => {
    const rebuilt = [block(3, '셋 바뀜'), block(1, '하나 바뀜')].join('\n\n');
    const blocks = parseSrtBlocks(spliceBlocks(full, rebuilt));

    expect(blocks[0]).toContain('하나 바뀜');
    expect(blocks[1]).toContain('둘');
    expect(blocks[2]).toContain('셋 바뀜');
  });
});

describe('applySubtitleRules', () => {
  const ko = resolveTargetLang('ko');
  const never = async () => {
    throw new Error('모델을 부르면 안 되는 경로다');
  };

  it('상한 초과가 없으면 모델을 아예 부르지 않는다', async () => {
    // 이 기능을 무료로 낼 수 있는 근거다 — ZAMAK이 번역한 자막을 다시 넣으면
    // 대개 이 경로이고, 그때 비용은 0이다.
    const split = vi.fn(never);
    const srt = [block(1, '짧은 줄'), block(2, '이것도 짧다')].join('\n\n');

    const { summary } = await applySubtitleRules(srt, ko, split);

    expect(split).not.toHaveBeenCalled();
    expect(summary.linesSplit).toBe(0);
    expect(summary.unsplitLines).toBe(0);
  });

  it('초과가 있으면 그 블록만 담아 모델에 넘긴다', async () => {
    const long = '스무 글자가 넘어가는 아주 기다란 자막 한 줄';
    const srt = [block(1, '짧다'), block(2, long)].join('\n\n');
    const split = vi.fn(async (subset: string) => {
      // 받은 건 초과 블록 하나뿐이어야 한다.
      expect(parseSrtBlocks(subset)).toHaveLength(1);
      expect(subset).toContain('00:00:02,000');
      return block(2, '스무 글자가 넘어가는\n아주 기다란 자막 한 줄');
    });

    const { content, summary } = await applySubtitleRules(srt, ko, split);

    expect(split).toHaveBeenCalledOnce();
    expect(summary.linesSplit).toBe(1);
    expect(summary.unsplitLines).toBe(0);
    expect(parseSrtBlocks(content)).toHaveLength(2);
  });

  it('모델이 못 나눈 블록은 unsplitLines로 정직하게 센다', async () => {
    const long = '스무 글자가 넘어가는 아주 기다란 자막 한 줄';
    const srt = block(1, long);
    // 청크가 실패해 원문이 그대로 돌아온 경우.
    const { summary } = await applySubtitleRules(srt, ko, async () => srt);

    expect(summary.unsplitLines).toBe(1);
    expect(summary.linesSplit).toBe(0);
  });

  it('1차와 2차 규칙 리포트를 합산한다', async () => {
    // 1차에서 마침표 하나, 2차에서 모델이 새로 만든 마침표 하나.
    const long = '스무 글자가 넘어가는 아주 기다란 자막입니다.';
    const srt = [block(1, '안녕하세요.'), block(2, long)].join('\n\n');

    const { summary } = await applySubtitleRules(srt, ko, async () =>
      block(2, '스무 글자가 넘어가는|아주 기다란 자막입니다.'),
    );

    // 1차: 1번 블록 + 2번 블록 = 2건, 2차: 모델 출력의 마침표 1건.
    expect(summary.trailingPunctuationStripped).toBeGreaterThanOrEqual(3);
  });

  it('타임코드를 바꾸지 않는다', async () => {
    const long = '스무 글자가 넘어가는 아주 기다란 자막 한 줄';
    const srt = [block(1, '짧다'), block(2, long)].join('\n\n');

    const { content } = await applySubtitleRules(srt, ko, async () =>
      block(2, '스무 글자가|넘어가는 자막'),
    );

    expect(content).toContain('00:00:01,000 --> 00:00:01,900');
    expect(content).toContain('00:00:02,000 --> 00:00:02,900');
  });

  // 읽기 속도 밴드(opt-in) — 이 화면에서 타임코드가 바뀔 수 있는 **유일한** 길.
  describe('timing 옵션', () => {
    // 0.9초에 12자 = 13.3 CPS. 상한 12를 넘으므로 넓혀야 하는 자막이다.
    const fast = '열두글자짜리인자막줄이다';
    const srt = () => [block(1, '짧다'), block(2, fast)].join('\n\n');

    it('안 주면 지금까지와 똑같이 타임코드를 안 건드린다', async () => {
      const { content, summary } = await applySubtitleRules(srt(), ko, never);

      expect(content).toContain('00:00:02,000 --> 00:00:02,900');
      expect(summary.timingAdjusted).toBe(0);
    });

    it('주면 너무 빠른 자막만 넓히고 느린 자막은 그대로 둔다', async () => {
      const { content, summary } = await applySubtitleRules(srt(), ko, never, {
        cpsTarget: 10,
        cpsHardMax: 12,
      });

      // 2.2 CPS로 읽히는 1번은 손댈 이유가 없다.
      expect(content).toContain('00:00:01,000 --> 00:00:01,900');
      expect(content).not.toContain('00:00:02,000 --> 00:00:02,900');
      expect(summary.timingAdjusted).toBe(1);
      expect(parseSrtBlocks(content)).toHaveLength(2);
    });

    it('상한을 올려 잡으면 아무것도 안 넓힌다', async () => {
      const { content, summary } = await applySubtitleRules(srt(), ko, never, {
        cpsTarget: 14,
        cpsHardMax: 16,
      });

      expect(content).toContain('00:00:02,000 --> 00:00:02,900');
      expect(summary.timingAdjusted).toBe(0);
    });
  });
});
