import { describe, expect, it } from 'vitest';
import {
  buildOutputFilename,
  chunkSrtBlocks,
  parseSrtBlocks,
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
