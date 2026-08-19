import { describe, expect, it } from 'vitest';
import { collectOverLongBlocks, spliceBlocks } from './polish';
import { parseSrtBlocks } from './srt';

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
