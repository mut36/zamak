import { describe, expect, it } from 'vitest';
import {
  buildOutputFilename,
  chunkSrtBlocks,
  chunkSrtBlocksAtGaps,
  computeCps,
  parseBlockTiming,
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

function fmtMs(ms: number): string {
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const milli = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${milli}`;
}

function block(seq: number, startMs: number, endMs: number, text = 'line'): string {
  return `${seq}\n${fmtMs(startMs)} --> ${fmtMs(endMs)}\n${text}`;
}

/**
 * Build `count` back-to-back 1s subtitles with a small 100ms gap, then apply
 * `gapsAfter` (boundary index → gap in ms) to widen specific boundaries.
 */
function timeline(count: number, gapsAfter: Record<number, number> = {}): string[] {
  const blocks: string[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    const start = t;
    const end = start + 1000;
    blocks.push(block(i + 1, start, end));
    const gap = gapsAfter[i] ?? 100;
    t = end + gap;
  }
  return blocks;
}

describe('parseBlockTiming', () => {
  it('parses start/end into milliseconds', () => {
    expect(parseBlockTiming('801\n00:01:23,456 --> 00:01:25,789\nHi')).toEqual({
      startMs: 83_456,
      endMs: 85_789,
    });
  });

  it('returns null for a block with no well-formed timing line', () => {
    expect(parseBlockTiming('801\nnot a timecode\nHi')).toBeNull();
    expect(parseBlockTiming('just one line')).toBeNull();
  });
});

describe('chunkSrtBlocksAtGaps', () => {
  it('cuts at a scene-break gap within the window instead of the exact target', () => {
    // target 10, ±20% -> window boundaries after blocks 7..11 (cuts 8..12).
    const blocks = timeline(20, { 9: 3000 }); // 3s gap after block index 9 -> cut at 10
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    expect(chunks[0].split('\n\n')).toHaveLength(10);
  });

  it('picks the largest qualifying gap when several are in the window', () => {
    const blocks = timeline(20, { 8: 2500, 10: 4000 });
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    // The 4s gap after block 10 wins over the 2.5s after block 8 -> cut at 11.
    expect(chunks[0].split('\n\n')).toHaveLength(11);
  });

  it('falls back to the exact target when no gap clears the threshold', () => {
    const blocks = timeline(20); // all gaps are 100ms
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    expect(chunks[0].split('\n\n')).toHaveLength(10);
  });

  it('never cuts at an overlapping (negative-gap) boundary', () => {
    // A big overlap after block 9; otherwise only small gaps -> falls back to target.
    const blocks = timeline(20, { 9: -4000 });
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    expect(chunks[0].split('\n\n')).toHaveLength(10);
  });

  it('skips blocks with unparseable timing and uses the next best gap', () => {
    const blocks = timeline(20, { 10: 3000 });
    // Corrupt the timing on block index 10 so the 3s gap after it can't be read.
    blocks[10] = '11\nBROKEN TIMECODE\nline';
    blocks[11] = `12\n${fmtMs(999_000)} --> ${fmtMs(1_000_000)}\nline`;
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    // No readable gap in the window -> fixed fallback at target.
    expect(chunks[0].split('\n\n')).toHaveLength(10);
  });

  it('returns a single chunk when the file fits within maxSize', () => {
    const blocks = timeline(12, { 5: 5000 });
    expect(chunkSrtBlocksAtGaps(blocks, 10)).toHaveLength(1);
  });

  it('preserves every block and its order', () => {
    const blocks = timeline(50, { 9: 3000, 21: 4000, 33: 2500 });
    const chunks = chunkSrtBlocksAtGaps(blocks, 10);
    expect(chunks.join('\n\n')).toBe(blocks.join('\n\n'));
  });

  it('respects a custom threshold and tolerance', () => {
    const blocks = timeline(20, { 9: 1200 });
    // Default 2s threshold ignores the 1.2s gap -> target cut at 10.
    expect(chunkSrtBlocksAtGaps(blocks, 10)[0].split('\n\n')).toHaveLength(10);
    // Lowering the threshold to 1s lets the 1.2s gap win -> cut at 10 as well,
    // so widen the window and place the gap off-target to prove it moves.
    const off = timeline(20, { 7: 1200 });
    expect(
      chunkSrtBlocksAtGaps(off, 10, { gapThresholdMs: 1000 })[0].split('\n\n'),
    ).toHaveLength(8);
  });

  it('throws on a non-positive target size', () => {
    expect(() => chunkSrtBlocksAtGaps(['a'], 0)).toThrow();
    expect(() => chunkSrtBlocksAtGaps(['a'], -5)).toThrow();
    expect(() => chunkSrtBlocksAtGaps(['a'], 1.5)).toThrow();
  });
});

describe('computeCps', () => {
  it('computes characters per second over the on-screen duration', () => {
    expect(computeCps('801\n00:00:00,000 --> 00:00:02,000\n안녕하세요')).toEqual({
      durationMs: 2000,
      charCount: 5,
      cps: 2.5,
    });
  });

  it('sums a multi-line body and drops the line break, keeping spaces', () => {
    const r = computeCps('1\n00:00:00,000 --> 00:00:01,000\nHello there\nworld');
    // "Hello there" (11, space counted) + "world" (5) = 16, no newline char.
    expect(r?.charCount).toBe(16);
    expect(r?.cps).toBe(16);
  });

  it('strips HTML and ASS style tags before counting', () => {
    const r = computeCps('1\n00:00:00,000 --> 00:00:01,000\n<i>{\\an8}안녕</i>');
    expect(r?.charCount).toBe(2);
  });

  it('returns null when the block has no parseable timing', () => {
    expect(computeCps('1\nnot a timecode\nhi')).toBeNull();
  });

  it('returns cps null for a zero-length display window', () => {
    expect(computeCps('1\n00:00:05,000 --> 00:00:05,000\nhi')).toEqual({
      durationMs: 0,
      charCount: 2,
      cps: null,
    });
  });
});
