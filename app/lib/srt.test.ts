import { describe, expect, it } from 'vitest';
import {
  adjustSubtitleTiming,
  buildOutputFilename,
  chunkSrtBlocks,
  chunkSrtBlocksAtGaps,
  computeCps,
  enforceTextRules,
  formatBlocksForModel,
  parseBlockTiming,
  parseSrtBlocks,
  reassembleTranslatedChunk,
  subtitleRuntimeMs,
} from './srt';
import { readFileSync } from 'node:fs';

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
    expect(buildOutputFilename('movie.srt', 'ko')).toBe('movie.ko.srt');
    expect(buildOutputFilename('movie.srt', 'en')).toBe('movie.en.srt');
    expect(buildOutputFilename('movie.srt', 'Portuguese Brazil')).toBe(
      'movie.portuguese.srt',
    );
  });

  it('replaces a known source language code before .srt', () => {
    expect(buildOutputFilename('movie.it.srt', 'ko')).toBe('movie.ko.srt');
    expect(buildOutputFilename('Movie.EN.SRT', 'ko')).toBe('Movie.ko.SRT');
    expect(buildOutputFilename('show.ja.srt', 'en')).toBe('show.en.srt');
  });

  it('appends when the pre-.srt token is not a known language code', () => {
    expect(buildOutputFilename('movie.hd.srt', 'ko')).toBe('movie.hd.ko.srt');
    expect(buildOutputFilename('movie.2024.srt', 'ko')).toBe(
      'movie.2024.ko.srt',
    );
  });

  it('maps non-SRT inputs to .srt output by default', () => {
    expect(buildOutputFilename('movie.vtt', 'ko')).toBe('movie.ko.srt');
    expect(buildOutputFilename('movie.smi', 'ko')).toBe('movie.ko.srt');
    expect(buildOutputFilename('movie.it.ass', 'ko')).toBe('movie.ko.srt');
    expect(buildOutputFilename('show.ssa', 'en')).toBe('show.en.srt');
  });

  it('keeps the input extension when downloading in that same format', () => {
    expect(buildOutputFilename('movie.vtt', 'ko', 'vtt')).toBe('movie.ko.vtt');
    expect(buildOutputFilename('movie.it.vtt', 'ko', 'vtt')).toBe('movie.ko.vtt');
    expect(buildOutputFilename('movie.VTT', 'ko', 'vtt')).toBe('movie.ko.VTT');
    expect(buildOutputFilename('movie.hd.vtt', 'ko', 'vtt')).toBe('movie.hd.ko.vtt');
  });
});

describe('formatBlocksForModel', () => {
  it('prefixes each line with its own [N] marker and drops timestamps', () => {
    const source = [
      '801\n00:01:23,456 --> 00:01:25,789\nWhere have you been?',
      '802\n00:01:26,100 --> 00:01:28,000\nJust looking around.',
    ].join('\n\n');
    expect(formatBlocksForModel(source)).toBe(
      '[801] Where have you been?\n\n[802] Just looking around.',
    );
  });

  it('repeats the marker on every line of a multi-line body', () => {
    const source = '14\n00:00:01,000 --> 00:00:04,000\nfirst line\nsecond line';
    expect(formatBlocksForModel(source)).toBe(
      '[14] first line\n[14] second line',
    );
  });

  it('passes a malformed block through with only a timestamp-shaped line stripped', () => {
    const source =
      '1\nnot a timecode\nSome text\n\n2\n00:00:01,000 --> 00:00:02,000\nHello';
    expect(formatBlocksForModel(source)).toBe(
      '1\nnot a timecode\nSome text\n\n[2] Hello',
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
    const output = '[801] 어디 갔었어\n\n[802] 그냥 좀 둘러봤어\n\n[803] 이 시간에?';
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
    const output = '[801] 어디 갔었길래 좀 둘러봤다는 거야\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 2, unmatched: 1 });
    // The sweep needs the sequence number, not just the count, to re-send it.
    expect(result.unmatchedIndices).toEqual([802]);
    // 802 falls back to the original line rather than pulling 803's timecode up.
    expect(result.content).toContain(
      '802\n00:01:26,100 --> 00:01:28,000\nJust looking around.',
    );
    expect(result.content).toContain(
      '803\n00:01:29,000 --> 00:01:31,500\n이 시간에?',
    );
  });

  it('recovers when the model drops the blank lines between blocks', () => {
    const output = '[801] 어디 갔었어\n[802] 그냥 좀 둘러봤어\n[803] 이 시간에?';
    expect(reassembleTranslatedChunk(source, output).matched).toBe(3);
  });

  it('ignores a code fence and a preamble', () => {
    const output =
      '```srt\n번역 결과입니다\n[801] 어디 갔었어\n\n[802] 그냥 좀 둘러봤어\n\n[803] 이 시간에?\n```';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).not.toContain('번역 결과입니다');
    expect(result.content).not.toContain('```');
  });

  it('drops timestamps the model echoed back and uses the source ones', () => {
    const output =
      '[801] 00:00:00,000 --> 00:00:00,001\n[801] 어디 갔었어\n\n[802] 그냥 좀 둘러봤어\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어',
    );
    expect(result.content).not.toContain('00:00:00,000');
  });

  it('joins lines that repeat a marker into one multi-line body', () => {
    const output = '[801] 어디 갔었어\n[801] 말도 없이\n\n[802] 그냥\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어\n말도 없이',
    );
  });

  it('tolerates an unmarked continuation line directly under a marked one', () => {
    // The model split a subtitle across two lines but only labelled the first.
    // No blank line intervenes, so the second line is a continuation.
    const output = '[801] 어디 갔었어\n말도 없이\n\n[802] 그냥\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.matched).toBe(3);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어\n말도 없이',
    );
  });

  it('still parses the older standalone-marker format', () => {
    const output = '[801]\n어디 갔었어\n\n[802]\n그냥 좀 둘러봤어\n\n[803]\n이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 3, unmatched: 0 });
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어',
    );
  });

  it('does not mistake dialogue that is only digits for a sequence number', () => {
    const numeric = [
      '11\n00:00:01,000 --> 00:00:02,000\n1999',
      '12\n00:00:03,000 --> 00:00:04,000\nThat year.',
    ].join('\n\n');
    const output = '[11] 1999\n\n[12] 그 해에';
    const result = reassembleTranslatedChunk(numeric, output);

    expect(result.matched).toBe(2);
    expect(result.content).toContain('11\n00:00:01,000 --> 00:00:02,000\n1999');
  });

  it('regression: a numeric-counting scene does not poison later blocks in the same chunk', () => {
    // The real bug: dialogue "8", "9", "10" sit inside the chunk's own
    // sequence range (1..12), so a bare-digit marker scheme would swallow
    // them as headers and lose every block from "8" onward. The bracket
    // marker must keep all of them as ordinary dialogue.
    const counting = [
      '1\n00:00:01,000 --> 00:00:02,000\nStart counting',
      '2\n00:00:03,000 --> 00:00:04,000\n8.',
      '3\n00:00:05,000 --> 00:00:06,000\n9.',
      '4\n00:00:07,000 --> 00:00:08,000\n10.',
      '5\n00:00:09,000 --> 00:00:10,000\nDone.',
    ].join('\n\n');
    const output = [
      '[1] 숫자를 세기 시작해',
      '[2] 8',
      '[3] 9',
      '[4] 10',
      '[5] 끝',
    ].join('\n');
    const result = reassembleTranslatedChunk(counting, output);

    expect(result).toMatchObject({ matched: 5, unmatched: 0, total: 5 });
    expect(result.content).toContain('2\n00:00:03,000 --> 00:00:04,000\n8');
    expect(result.content).toContain('3\n00:00:05,000 --> 00:00:06,000\n9');
    expect(result.content).toContain('4\n00:00:07,000 --> 00:00:08,000\n10');
    expect(result.content).toContain('5\n00:00:09,000 --> 00:00:10,000\n끝');
  });

  it('regression: bare numeric dialogue is never a marker after MARKER_LINE widen', () => {
    // Widening MARKER_LINE to absorb `[177 me]` must keep the §2-1 guarantee:
    // dialogue "8." has no brackets, so it is never a marker — even when 8 is
    // in the chunk's expected set. Here "8." sits unmarked under an open run
    // and must attach as dialogue, not open (or steal) block 8.
    const counting = [
      '1\n00:00:01,000 --> 00:00:02,000\nReady',
      '8\n00:00:03,000 --> 00:00:04,000\n8.',
      '9\n00:00:05,000 --> 00:00:06,000\n9.',
    ].join('\n\n');
    const output = '[1] 준비\n8.\n\n[8] 팔\n\n[9] 구';
    const result = reassembleTranslatedChunk(counting, output);

    expect(result).toMatchObject({ matched: 3, unmatched: 0 });
    expect(result.content).toContain(
      '1\n00:00:01,000 --> 00:00:02,000\n준비\n8.',
    );
    expect(result.content).toContain('8\n00:00:03,000 --> 00:00:04,000\n팔');
    expect(result.content).toContain('9\n00:00:05,000 --> 00:00:06,000\n구');
  });

  it('regression: junk inside brackets still starts the numbered block', () => {
    // Observed twice in harness (2026-07-25 `[1434 me]`, 2026-07-28 `[177 me]`):
    // the model leaks an adjacent token into the marker. Without tolerance the
    // line fails MARKER_LINE and attaches to the open neighbour — so 176's body
    // becomes "레오! / [177 me] 저를 따라오세요." and 177 falls back to source.
    const pair = [
      '176\n00:00:01,000 --> 00:00:02,000\nLeo!',
      '177\n00:00:03,000 --> 00:00:04,000\nFollow me.',
    ].join('\n\n');
    const output = '[176] 레오!\n\n[177 me] 저를 따라오세요.';
    const result = reassembleTranslatedChunk(pair, output);

    expect(result).toMatchObject({ matched: 2, unmatched: 0, total: 2 });
    expect(result.content).toContain(
      '176\n00:00:01,000 --> 00:00:02,000\n레오!',
    );
    expect(result.content).toContain(
      '177\n00:00:03,000 --> 00:00:04,000\n저를 따라오세요.',
    );
    expect(result.content).not.toContain('[177 me]');
  });

  it('regression: a dropped marker cannot corrupt the neighbouring block', () => {
    // Observed in a real run: the model translated every block but omitted one
    // marker, leaving its text orphaned after a blank line. That text used to
    // be absorbed into whichever block was still open, embedding a blank line
    // in its body — which then split the block in two when written back as
    // SRT, producing a header-less ghost block. The orphan must be discarded
    // and its own block must fall back to the source instead.
    const output = '[801] 어디 갔었어\n\n그냥 좀 둘러봤어\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 2, unmatched: 1 });
    // 801 keeps exactly its own translation — no orphan, no embedded blank.
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어\n\n802',
    );
    // 802 honestly falls back to the source text.
    expect(result.content).toContain(
      '802\n00:01:26,100 --> 00:01:28,000\nJust looking around.',
    );
    // The rebuilt SRT still has exactly 3 well-formed blocks.
    const reparsed = parseSrtBlocks(result.content);
    expect(reparsed).toHaveLength(3);
    expect(reparsed.map((b) => b.split('\n')[0])).toEqual(['801', '802', '803']);
  });

  it('starts a block for any expected marker regardless of order (no monotonic requirement)', () => {
    // Reversed order used to fold 801's text into whatever block was already
    // open, because the old scheme required markers to increase. With
    // brackets there's no ambiguity to guard against, so out-of-order markers
    // are just... markers.
    const output = '[803] 이 시간에?\n\n[801] 어디 갔었어\n\n[802] 그냥 좀 둘러봤어';
    const result = reassembleTranslatedChunk(source, output);

    expect(result).toMatchObject({ matched: 3, unmatched: 0 });
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\n어디 갔었어',
    );
    expect(result.content).toContain(
      '803\n00:01:29,000 --> 00:01:31,500\n이 시간에?',
    );
  });

  it('falls back to the original when a translated body is empty', () => {
    const output = '[801]\n\n\n[802] 그냥 좀 둘러봤어\n\n[803] 이 시간에?';
    const result = reassembleTranslatedChunk(source, output);

    expect(result.unmatched).toBe(1);
    expect(result.content).toContain(
      '801\n00:01:23,456 --> 00:01:25,789\nWhere have you been?',
    );
  });

  it('reports no matches when the output is unusable', () => {
    const result = reassembleTranslatedChunk(source, '죄송하지만 번역할 수 없습니다.');
    expect(result).toMatchObject({ matched: 0, unmatched: 3, total: 3 });
    expect(result.unmatchedIndices).toEqual([801, 802, 803]);
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

describe('adjustSubtitleTiming', () => {
  const cpsOf = (block: string) => computeCps(block)?.cps ?? null;

  it('leaves a block under the hard max untouched', () => {
    // 5 chars over 2s = 2.5 cps.
    const srt = '1\n00:00:00,000 --> 00:00:02,000\n안녕하세요';
    expect(adjustSubtitleTiming(srt)).toBe(srt);
  });

  it('leaves a block between the target and the hard max untouched', () => {
    // 22 chars over 2s = 11 cps — above the 10 target but under the 12 hard
    // max, so it is not a violation and must not be touched.
    const srt = '1\n00:00:00,000 --> 00:00:02,000\n' + '가'.repeat(22);
    expect(adjustSubtitleTiming(srt)).toBe(srt);
  });

  it('widens a fast block into free surrounding silence down to the target', () => {
    // 20 chars over 1s = 20 cps (> 12 hard max); target 10 needs 2.0s. Gap
    // after runs to 10s, so the end alone can cover the whole deficit.
    const srt =
      '1\n00:00:01,000 --> 00:00:02,000\n' +
      '가'.repeat(20) + '\n\n' +
      '2\n00:00:10,000 --> 00:00:12,000\n다음';
    const out = adjustSubtitleTiming(srt);
    const blocks = parseSrtBlocks(out);
    // Reached the 10 target (within rounding).
    expect(cpsOf(blocks[0])!).toBeLessThanOrEqual(10.01);
    // End pushed later first; start held (there was no earlier neighbour cost).
    expect(blocks[0]).toContain('00:00:01,000 --> 00:00:03,000');
    // The comfortable second block is unchanged.
    expect(blocks[1]).toContain('00:00:10,000 --> 00:00:12,000');
  });

  it('pulls the FIRST block back into the free pre-roll before it', () => {
    // First block is fast (14 chars / 1s = 14 cps) with a big empty pre-roll
    // (starts at 5s) and a tight neighbour right after, so the only room is
    // backward — the first block must be allowed to use it.
    const srt =
      '1\n00:00:05,000 --> 00:00:06,000\n' + '가'.repeat(14) + '\n\n' +
      '2\n00:00:06,050 --> 00:00:08,000\n다음';
    const out = adjustSubtitleTiming(srt);
    const blocks = parseSrtBlocks(out);
    // Start pulled earlier to reach the target; no forward room was available.
    expect(blocks[0]).toContain('00:00:04,600 --> 00:00:06,000');
    expect(cpsOf(blocks[0])!).toBeLessThanOrEqual(10.01);
  });

  it('never overlaps neighbours and keeps the min gap when silence is tight', () => {
    // Two fast blocks with only a 100ms gap between them.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n' +
      '가나다라마바사아자차카타파하\n\n' +
      '2\n00:00:01,100 --> 00:00:02,100\n' +
      '가나다라마바사아자차카타파하';
    const out = adjustSubtitleTiming(srt, { cpsTarget: 12, minGapMs: 84 });
    const [a, b] = parseSrtBlocks(out).map(parseBlockTiming);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // No overlap, and at least the min gap is preserved.
    expect(b!.startMs - a!.endMs).toBeGreaterThanOrEqual(84);
    // Windows only grew, never shrank.
    expect(a!.endMs - a!.startMs).toBeGreaterThanOrEqual(1000);
    expect(b!.endMs - b!.startMs).toBeGreaterThanOrEqual(1000);
  });

  it('preserves block count, sequence numbers, and body text', () => {
    const srt =
      '1\n00:00:01,000 --> 00:00:02,000\n<i>빠른 자막입니다 정말로</i>\n\n' +
      '2\n00:00:20,000 --> 00:00:22,000\n느긋한 자막';
    const out = adjustSubtitleTiming(srt);
    const blocks = parseSrtBlocks(out);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].split('\n')[0]).toBe('1');
    expect(blocks[0]).toContain('<i>빠른 자막입니다 정말로</i>');
    expect(blocks[1].split('\n')[0]).toBe('2');
  });

  it('passes an unparseable block through and does not extend across it', () => {
    const srt =
      '1\nnot a timecode\n서문\n\n' +
      '2\n00:00:05,000 --> 00:00:06,000\n' + '가'.repeat(14) + '\n\n' +
      '3\n00:00:20,000 --> 00:00:22,000\n다음';
    const out = adjustSubtitleTiming(srt);
    const blocks = parseSrtBlocks(out);
    // The malformed block is untouched.
    expect(blocks[0]).toBe('1\nnot a timecode\n서문');
    // The fast block widened forward (room to block 3 at 20s) but did NOT pull
    // its start back over the unknown span of the wall (start stays at 5s).
    expect(blocks[1]).toContain('00:00:05,000 --> 00:00:06,400');
  });

  it('widens a block shorter than minDurationMs even with a comfortable cps', () => {
    // 2 chars over 0.2s = 10 cps — under the hard max, so cps alone would
    // never trigger a widen. minDurationMs must still kick in.
    const srt =
      '1\n00:00:01,000 --> 00:00:01,200\n가나\n\n' +
      '2\n00:00:10,000 --> 00:00:12,000\n다음';
    const out = adjustSubtitleTiming(srt, { minDurationMs: 800 });
    const [a] = parseSrtBlocks(out).map(parseBlockTiming);
    expect(a!.endMs - a!.startMs).toBeGreaterThanOrEqual(800);
  });

  it('widens an empty block too short in duration', () => {
    // No visible text at all — cps is meaningless (charCount 0), but the
    // block is still on screen too briefly and must be widened.
    const srt =
      '1\n00:00:01,000 --> 00:00:01,100\n\n\n' +
      '2\n00:00:10,000 --> 00:00:12,000\n다음';
    const out = adjustSubtitleTiming(srt, { minDurationMs: 800 });
    const [a] = parseSrtBlocks(out).map(parseBlockTiming);
    expect(a!.endMs - a!.startMs).toBeGreaterThanOrEqual(800);
  });

  it('does not shrink a block already at or above minDurationMs', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n안녕';
    expect(adjustSubtitleTiming(srt, { minDurationMs: 800 })).toBe(srt);
  });
});

describe('enforceTextRules', () => {
  it('normalizes ASCII ellipsis runs of 2 or more dots to a single "…"', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n음... 글쎄';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n음… 글쎄');
    expect(report.ellipsisNormalized).toBe(1);
  });

  it('normalizes a longer run (4+ dots) the same way', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n글쎄....';
    const { content } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n글쎄…');
  });

  it('strips a trailing sentence-final period', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n안녕하세요.';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n안녕하세요');
    expect(report.trailingPunctuationStripped).toBe(1);
  });

  it('strips a trailing comma at line end', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n그리고,';
    const { content } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n그리고');
  });

  it('strips punctuation that sits behind a closing tag', () => {
    // Narration is italicized, so the line ends in `</i>` and the comma is not
    // last. Anchoring the strip at the true line end let every such line keep
    // its punctuation — 28 of them in one real feature.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>2016년 12월 16일,</i>';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n<i>2016년 12월 16일</i>',
    );
    expect(report.trailingPunctuationStripped).toBe(1);
  });

  it('strips punctuation behind a run of nested closing tags', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i><b>그리고,</b></i>';
    const { content } = enforceTextRules(srt);
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n<i><b>그리고</b></i>',
    );
  });

  it('leaves a tagged line whose text needs no strip untouched', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>합동 생일 파티를 열었다</i>';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe(srt);
    expect(report.trailingPunctuationStripped).toBe(0);
  });

  it('does not mistake a normalized ellipsis for a trailing period', () => {
    // After normalization the line ends in "…", not ".", so the punctuation
    // strip must leave it alone.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n글쎄...';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n글쎄…');
    expect(report.trailingPunctuationStripped).toBe(0);
  });

  it('keeps the internal "…" spelling when no ellipsis option is given', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n글쎄...';
    const { content } = enforceTextRules(srt, {});
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n글쎄…');
  });

  it('respells the normalized ellipsis to the target language\'s form', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n음... 글쎄';
    const { content } = enforceTextRules(srt, { ellipsis: '...' });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n음... 글쎄');
  });

  it('respells an ellipsis that was already "…" in the source, not just normalized ones', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n글쎄…';
    const { content } = enforceTextRules(srt, { ellipsis: '...' });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n글쎄...');
  });

  it('measures the line-join budget against the single-character "…", not the respelled form', () => {
    // "내 아내와" + " " + "딸…" is 8 visible characters either way — but if the
    // join measured against the 3-character "..." spelling instead of the
    // internal 1-character "…", a line sitting right at the budget could be
    // wrongly refused. lineMaxChars=8 only fits with the 1-character count.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n내 아내와\n딸...';
    const { content } = enforceTextRules(srt, {
      lineMaxChars: 8,
      ellipsis: '...',
    });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n내 아내와 딸...');
  });

  it('does not let the respelled ellipsis reintroduce a trailing-period strip', () => {
    // Respelling happens after the trailing-punctuation strip, so a Korean
    // line ending in the respelled "..." must not have its last dot eaten.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n글쎄...';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      ellipsis: '...',
    });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n글쎄...');
    expect(report.trailingPunctuationStripped).toBe(0);
  });

  it('leaves a compliant single line untouched', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n괜찮아';
    expect(enforceTextRules(srt).content).toBe(srt);
  });

  it('leaves an already-compliant 2-line block untouched', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n지금 생각하면 심장이 쿵 내려앉지만\n그만한 가치가 있었어요';
    expect(enforceTextRules(srt).content).toBe(srt);
  });

  it('merges a 3rd+ line into line 2, keeping the 2-line cap', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n첫째 줄\n둘째 줄\n셋째 줄';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n첫째 줄\n둘째 줄 셋째 줄',
    );
    expect(report.linesMerged).toBe(1);
  });

  it('merges 4+ lines all into line 2, dropping no text', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\nA\nB\nC\nD';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\nA\nB C D');
    expect(report.linesMerged).toBe(2);
  });

  it('preserves block count, sequence numbers, and timecodes', () => {
    const srt =
      '1\n00:00:01,000 --> 00:00:02,000\n안녕.\n\n' +
      '2\n00:00:20,000 --> 00:00:22,000\n느긋한 자막';
    const { content } = enforceTextRules(srt);
    const blocks = parseSrtBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe('1\n00:00:01,000 --> 00:00:02,000\n안녕');
    expect(blocks[1]).toBe('2\n00:00:20,000 --> 00:00:22,000\n느긋한 자막');
  });

  it('passes a malformed (unparseable-timing) block through untouched', () => {
    const srt = '1\nnot a timecode\n서문...';
    expect(enforceTextRules(srt).content).toBe(srt);
  });

  it('keeps sentence punctuation for a language whose convention keeps it', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\nI know what you did.';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '',
    });
    expect(content).toBe(srt);
    expect(report.trailingPunctuationStripped).toBe(0);
  });

  it('still caps lines and normalizes ellipses when punctuation is kept', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\nWell...\nA\nB';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '',
    });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\nWell…\nA B');
    expect(report.ellipsisNormalized).toBe(1);
    expect(report.linesMerged).toBe(1);
  });

  it('joins two lines that fit on one', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n내 아내와\n딸';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n내 아내와 딸');
    expect(report.linesJoined).toBe(1);
  });

  it('leaves two lines apart when joining would overflow', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n지금 생각하면 심장이 쿵 내려앉지만\n그만한 가치가 있었어요';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe(srt);
    expect(report.linesJoined).toBe(0);
  });

  it('does not join without a lineMaxChars budget', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n내 아내와\n딸';
    const { content, report } = enforceTextRules(srt);
    expect(content).toBe(srt);
    expect(report.linesJoined).toBe(0);
  });

  it('keeps a two-speaker block on two lines however short it is', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n- 어디 가?\n- 몰라';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe(srt);
    expect(report.linesJoined).toBe(0);
  });

  it('keeps a two-speaker block apart even when the dash is inside markup', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>- 어디 가?</i>\n<i>- 몰라</i>';
    expect(enforceTextRules(srt, { lineMaxChars: 25 }).content).toBe(srt);
  });

  it('joins a tag pair that only completes once the lines are together', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>살아남은 벨로키오\n남매들은</i>';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n<i>살아남은 벨로키오 남매들은</i>',
    );
    expect(report.linesJoined).toBe(1);
  });

  it('refuses to join when the joined line would leave a tag unclosed', () => {
    // Several players end an unclosed italic at the line break, so folding
    // these together would newly italicize the second line.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n<i>속삭이며\n그가 말했다';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe(srt);
    expect(report.linesJoined).toBe(0);
  });

  it('measures the budget on visible characters, not markup', () => {
    // 20 visible chars wrapped in tags that would push a naive count past 25.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n<i>정확히 뭘 하고 싶은지\n나도 몰랐다</i>';
    const { report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(report.linesJoined).toBe(1);
  });

  it('measures the budget after the punctuation strip frees a character', () => {
    // 25 visible chars once the trailing comma goes; 26 with it.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n가나다라마바사아자차카타파,\n하가나다라마바사아자차';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n가나다라마바사아자차카타파 하가나다라마바사아자차',
    );
    expect(report.linesJoined).toBe(1);
  });

  it('rewrites a mid-line sentence period as a comma', () => {
    // 기준 문서 §I.13: "사랑해. 그게 내가" (X) → "사랑해, 그게 내가" (O).
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n압니다. 결혼식에 관한 영화를\n작업 중인데 아주 열심이죠';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n압니다, 결혼식에 관한 영화를\n작업 중인데 아주 열심이죠',
    );
    expect(report.midLinePeriodsToCommas).toBe(1);
  });

  it('leaves a decimal point and a Latin abbreviation alone', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n3.5초 남았어\n\n' +
      '2\n00:00:02,000 --> 00:00:03,000\nMr. 스미스를 찾아';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
    });
    expect(content).toBe(srt);
    expect(report.midLinePeriodsToCommas).toBe(0);
  });

  it('keeps mid-line periods for a language whose convention keeps them', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\nI know. That was the point';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '',
    });
    expect(content).toBe(srt);
    expect(report.midLinePeriodsToCommas).toBe(0);
  });

  it('refuses to join two sentences even when they fit on one line', () => {
    // 24 visible chars joined, so arithmetic alone would fold it — but the
    // break sits on a sentence boundary, which is a reason to keep it.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\nDVD 버전을 추천합니다.\n화질이 더 좋거든요';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\nDVD 버전을 추천합니다\n화질이 더 좋거든요',
    );
    expect(report.linesJoined).toBe(0);
    expect(report.trailingPunctuationStripped).toBe(1);
  });

  it('refuses to join across a question mark or an ellipsis', () => {
    for (const mark of ['?', '…']) {
      const srt = `1\n00:00:00,000 --> 00:00:01,000\n어디 가${mark}\n난 몰라`;
      expect(enforceTextRules(srt, { lineMaxChars: 25 }).content).toBe(srt);
    }
  });

  it('sees the sentence end through a closing quote and tag', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n<i>"형은 스타가 됐어."</i>\n<i>늘 그랬죠</i>';
    const { report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(report.linesJoined).toBe(0);
  });

  it('still joins when the first line ends mid-sentence', () => {
    // A trailing comma is not a sentence end, so this one still folds.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n가나다라마바사아자차카타파,\n하가나다라마바사아자차';
    const { report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(report.linesJoined).toBe(1);
  });

  it('splits a line carrying both speakers, one per line', () => {
    // 기준 문서 §I.6: 한 줄에 한 화자만.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n- 네. - 올해 가룟 유다에\n대한 영화를 만들었지…';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n- 네\n- 올해 가룟 유다에 대한 영화를 만들었지…',
    );
    expect(report.speakerLinesSplit).toBe(1);
  });

  it('does not treat a hyphen inside ordinary text as a speaker mark', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n오후 3 - 4시에 만나';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe(srt);
    expect(report.speakerLinesSplit).toBe(0);
  });

  it('strips a period hiding behind a closing quote', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n내게 말했어\n"이길 방법은 딱 하나뿐이야."';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\n내게 말했어\n"이길 방법은 딱 하나뿐이야"',
    );
    expect(report.trailingPunctuationStripped).toBe(1);
  });

  it('refuses to join when the first line ends a sentence without a period', () => {
    // "제겐 영광입니다" carries no punctuation at all — the 다 is the only signal.
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\n제겐 영광입니다\n더 잘해드리고 싶지만…';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(content).toBe(srt);
    expect(report.linesJoined).toBe(0);
  });

  it('still folds a phrase broken mid-sentence', () => {
    // 와 is a particle, not a sentence ending, so this one is still one phrase.
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n내 아내와\n딸';
    const { report } = enforceTextRules(srt, {
      trailingPunctuation: '.,',
      lineMaxChars: 25,
    });
    expect(report.linesJoined).toBe(1);
  });

  it('folds a 3-line block all the way to one line when it fits', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\n내\n아내와\n딸';
    const { content, report } = enforceTextRules(srt, { lineMaxChars: 25 });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\n내 아내와 딸');
    expect(report.linesMerged).toBe(1);
    expect(report.linesJoined).toBe(1);
  });

  it('strips the CJK full-width stops for a language that configures them', () => {
    const srt = '1\n00:00:00,000 --> 00:00:01,000\nそこにいるのか。';
    const { content, report } = enforceTextRules(srt, {
      trailingPunctuation: '.,。、',
    });
    expect(content).toBe('1\n00:00:00,000 --> 00:00:01,000\nそこにいるのか');
    expect(report.trailingPunctuationStripped).toBe(1);
  });
});

describe('subtitleRuntimeMs', () => {
  it('마지막 자막의 종료 시각을 영상 길이로 본다', () => {
    expect(
      subtitleRuntimeMs(
        '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n' +
          '2\n00:01:39,500 --> 00:01:42,250\nWorld',
      ),
    ).toBe(102_250);
  });

  it('블록이 시간순이 아니어도 가장 늦은 종료 시각을 쓴다', () => {
    // 수작업으로 편집된 파일에서 실제로 어긋난다. 마지막 블록을 그냥 믿으면
    // 견적의 러닝타임이 실제보다 짧게 나온다.
    expect(
      subtitleRuntimeMs(
        '1\n00:10:00,000 --> 00:10:05,000\nLate\n\n' +
          '2\n00:00:01,000 --> 00:00:02,000\nEarly',
      ),
    ).toBe(605_000);
  });

  it('타임코드가 깨진 블록은 건너뛰고, 하나도 없으면 null이다', () => {
    expect(
      subtitleRuntimeMs(
        '1\n(타임코드 없음)\nHello\n\n' +
          '2\n00:00:03,000 --> 00:00:04,000\nWorld',
      ),
    ).toBe(4_000);
    expect(subtitleRuntimeMs('')).toBe(null);
    expect(subtitleRuntimeMs('1\n(타임코드 없음)\nHello')).toBe(null);
  });

  it('실측 샘플의 줄/분 밀도가 화면에 적은 범위 안에 있다', () => {
    // `/pricing`의 분당 환산과 견적 줄의 '약'이 이 벌어짐 위에 서 있다
    // (§6-23). 샘플이 바뀌어 범위를 벗어나면 화면 문구도 같이 틀린다.
    const density = (path: string) => {
      const content = readFileSync(path, 'utf8');
      const lines = parseSrtBlocks(content).length;
      const minutes = subtitleRuntimeMs(content)! / 60_000;
      return lines / minutes;
    };
    const drama = density('samples/subtitles/drama-episode.srt');
    const movie = density('samples/subtitles/full-movie.srt');
    expect(drama).toBeGreaterThan(8);
    expect(drama).toBeLessThan(8.5);
    expect(movie).toBeGreaterThan(12);
    expect(movie).toBeLessThan(12.6);
  });
});
