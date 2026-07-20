import { describe, expect, it } from 'vitest';
import {
  buildOutputFilename,
  chunkSrtBlocks,
  parseSrtBlocks,
  reassembleTranslatedChunk,
} from './srt';

describe('SRT utilities', () => {
  it('normalizes line endings and parses blocks', () => {
    expect(
      parseSrtBlocks(
        '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n\r\n2\r00:00:03,000 --> 00:00:04,000\rWorld',
      ),
    ).toEqual([
      '1\n00:00:01,000 --> 00:00:02,000\nHello',
      '2\n00:00:03,000 --> 00:00:04,000\nWorld',
    ]);
  });

  it('keeps block order while chunking', () => {
    expect(chunkSrtBlocks(['a', 'b', 'c'], 2)).toEqual(['a\n\nb', 'c']);
  });

  it('builds a language-specific output filename', () => {
    expect(buildOutputFilename('movie.srt', 'Korean')).toBe('movie.ko.srt');
    expect(buildOutputFilename('movie.srt', 'Portuguese Brazil')).toBe(
      'movie.portuguese.srt',
    );
  });
});

describe('reassembleTranslatedChunk', () => {
  const source = [
    '801\n00:01:23,456 --> 00:01:25,789\nWhere have you been?',
    '802\n00:01:26,100 --> 00:01:28,000\nJust looking around.',
    '803\n00:01:29,000 --> 00:01:31,500\nAt this hour?',
  ].join('\n\n');

  it('restores source timecodes onto the translated text', () => {
    const output = '801\n어디 갔었어\n\n802\n그냥 좀 둘러봤어\n\n803\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 3, unmatched: 0, total: 3 });
    expect(result.content).toBe(
      [
        '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어',
        '802\n00:01:26,100 --> 00:01:28,000\n그냥 좀 둘러봤어',
        '803\n00:01:29,000 --> 00:01:31,500\n이 시간에?',
      ].join('\n\n'),
    );
  });

  it('keeps later blocks aligned when the model merges two subtitles', () => {
    // 802 is folded into 801 and never emitted on its own.
    const output = '801\n어디 갔었길래 좀 둘러봤다는 거야\n\n803\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 2, unmatched: 1 });
    // 802 falls back to the original line rather than pulling 803's timecode up.
    expect(result.content).toContain(
      '802\n00:01:26,100 --> 00:01:28,000\nJust looking around.',
    );
    expect(result.content).toContain(
      '803\n00:01:29,000 --> 00:01:31,500\n이 시간에?',
    );
  });

  it('recovers when the model drops the blank lines between blocks', () => {
    const output = '801\n어디 갔었어\n802\n그냥 좀 둘러봤어\n803\n이 시간에?';
    expect(reassembleTranslatedChunk(source, output).matched).toBe(3);
  });

  it('ignores a code fence and a preamble', () => {
    const output =
      '```srt\n번역 결과입니다\n801\n어디 갔었어\n\n802\n그냥 좀 둘러봤어\n\n803\n이 시간에?\n```';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).not.toContain('번역 결과입니다');
    expect(result.content).not.toContain('```');
  });

  it('drops timestamps the model echoed back and uses the source ones', () => {
    const output =
      '801\n00:00:00,000 --> 00:00:00,001\n어디 갔었어\n\n802\n그냥 좀 둘러봤어\n\n803\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어',
    );
    expect(result.content).not.toContain('00:00:00,000');
  });

  it('preserves multi-line subtitle bodies', () => {
    const output = '801\n어디 갔었어\n말도 없이\n\n802\n그냥\n\n803\n이 시간에?';
    expect(reassembleTranslatedChunk(source, output).content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어\n말도 없이',
    );
  });

  it('does not mistake dialogue that is only digits for a sequence number', () => {
    const numeric = [
      '11\n00:00:01,000 --> 00:00:02,000\n1999',
      '12\n00:00:03,000 --> 00:00:04,000\nThat year.',
    ].join('\n\n');
    const output = '11\n1999\n\n12\n그 해에';
    const result = reassembleTranslatedChunk(numeric, output);

    expect(result.matched).toBe(2);
    expect(result.content).toContain('11\n00:00:01,000 --> 00:00:02,000\n1999');
  });

  it('ignores a repeated sequence number instead of folding it into the text', () => {
    const output = '801\n어디 갔었어\n801\n다시\n\n802\n그냥\n\n803\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어\n다시',
    );
    expect(result.matched).toBe(3);
  });

  it('falls back to the original when a translated body is empty', () => {
    const output = '801\n\n\n802\n그냥 좀 둘러봤어\n\n803\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.unmatched).toBe(1);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\nWhere have you been?',
    );
  });

  it('reports no matches when the output is unusable', () => {
    const result = reassembleTranslatedChunk(source, '죄송하지만 번역할 수 없습니다.');
    expect(result).toMatchObject({ matched: 0, unmatched: 3, total: 3 });
    expect(result.content).toBe(source);
  });
});
