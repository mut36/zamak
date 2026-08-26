import { describe, expect, it } from 'vitest';
import { keepVerbatimBlocks } from './verbatimGuard';

const block = (n: number, body: string) =>
  `${n}\n00:00:0${n},000 --> 00:00:0${n},900\n${body}`;

describe('keepVerbatimBlocks', () => {
  it('줄만 나뉘었으면 통과시킨다', () => {
    const source = block(1, 'Io difendo le più importanti famiglie');
    const rebuilt = block(1, 'Io difendo le più\nimportanti famiglie');

    expect(keepVerbatimBlocks(source, rebuilt)).toEqual({
      content: rebuilt,
      rejected: 0,
    });
  });

  it('대사가 번역돼 오면 원문으로 되돌린다', () => {
    // 2026-08-26에 실제로 일어난 일 — 이탈리아어 자막이 한국어 지시와 함께
    // 모델로 가서 번역된 채 돌아왔다.
    const source = block(1, 'E questa è la fine della storia.');
    const rebuilt = block(1, '그리고 이것이 이야기의 끝이다');

    const result = keepVerbatimBlocks(source, rebuilt);

    expect(result.rejected).toBe(1);
    expect(result.content).toBe(source);
  });

  it('한 글자만 바뀌어도 되돌린다', () => {
    const source = block(1, 'Ultima offerta, prendere o lasciare');
    const rebuilt = block(1, 'Ultima offerta, prendere o lasciarlo');

    expect(keepVerbatimBlocks(source, rebuilt).rejected).toBe(1);
  });

  it('`|` 표시와 공백 변화는 허용한다', () => {
    const source = block(1, 'Ultima offerta. 15% prendere o lasciare.');
    const rebuilt = block(1, 'Ultima offerta.|15% prendere o lasciare.');

    expect(keepVerbatimBlocks(source, rebuilt).rejected).toBe(0);
  });

  it('통과한 블록과 되돌린 블록이 섞여도 각각 처리한다', () => {
    const source = [block(1, 'Buongiorno'), block(2, 'Devo andare')].join(
      '\n\n',
    );
    const rebuilt = [block(1, 'Buongiorno'), block(2, '가야 해요')].join('\n\n');

    const result = keepVerbatimBlocks(source, rebuilt);

    expect(result.rejected).toBe(1);
    expect(result.content).toBe(
      [block(1, 'Buongiorno'), block(2, 'Devo andare')].join('\n\n'),
    );
  });
});
