import { LANG_SUFFIX } from '../config/constants';

export function normalizeSrt(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function parseSrtBlocks(content: string): string[] {
  const normalized = normalizeSrt(content);
  if (!normalized) return [];

  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function chunkSrtBlocks(
  blocks: readonly string[],
  chunkSize: number,
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const chunks: string[] = [];
  for (let index = 0; index < blocks.length; index += chunkSize) {
    chunks.push(blocks.slice(index, index + chunkSize).join('\n\n'));
  }
  return chunks;
}

const TIMING_LINE = /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;

const TIMING_LINE_CAPTURE =
  /^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

export interface BlockTiming {
  /** Start of the subtitle's on-screen window, in milliseconds. */
  startMs: number;
  /** End of the subtitle's on-screen window, in milliseconds. */
  endMs: number;
}

function hmsToMs(h: string, m: string, s: string, ms: string): number {
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
}

/**
 * Parse a block's timing line into start/end milliseconds, or null when the
 * block has no well-formed `HH:MM:SS,mmm --> HH:MM:SS,mmm` line (the timing
 * line is always the second line in a parsed SRT block).
 */
export function parseBlockTiming(raw: string): BlockTiming | null {
  const timingLine = raw.split('\n')[1]?.trim() ?? '';
  const m = timingLine.match(TIMING_LINE_CAPTURE);
  if (!m) return null;
  return {
    startMs: hmsToMs(m[1], m[2], m[3], m[4]),
    endMs: hmsToMs(m[5], m[6], m[7], m[8]),
  };
}

const STYLE_TAG = /<[^>]*>|\{[^}]*\}/g;

export interface CpsResult {
  /** On-screen duration of the subtitle, in milliseconds. */
  durationMs: number;
  /** Visible character count (style tags stripped, line breaks not counted). */
  charCount: number;
  /** Characters per second, or null when the display window is non-positive. */
  cps: number | null;
}

/**
 * Reading-speed (characters-per-second) metric for a single subtitle block.
 *
 * Not wired to any feature yet — this is a measured primitive kept ready for a
 * future advanced-translation length-budgeting feature (a subtitle on screen
 * 1.2s can hold far fewer characters than one on screen 4s). Exposes the raw
 * durationMs and charCount alongside cps so that feature can pick its own CPS
 * convention (e.g. whether to count spaces) without re-parsing.
 *
 * Counting: HTML (`<i>`) and ASS override (`{\an8}`) style tags are stripped
 * first (they aren't reading load); characters are counted by code point so
 * multibyte glyphs count as one; line breaks are dropped, not counted. Returns
 * null when the block has no parseable timing.
 */
export function computeCps(raw: string): CpsResult | null {
  const timing = parseBlockTiming(raw);
  if (!timing) return null;

  const durationMs = timing.endMs - timing.startMs;
  const body = raw.split('\n').slice(2).join('\n');
  const visible = body.replace(STYLE_TAG, '').replace(/\n/g, '').trim();
  const charCount = [...visible].length;
  const cps = durationMs > 0 ? charCount / (durationMs / 1000) : null;

  return { durationMs, charCount, cps };
}

export interface GapChunkOptions {
  /**
   * How far a cut may drift from targetSize, as a fraction of it.
   * Default 0.2 (±20%). targetSize + tolerance must stay under the ~600-block
   * renumbering-drift ceiling (see SERVER_CHUNK_SIZE in config/constants.ts):
   * at B=400 the max chunk is 480, safely under it.
   */
  toleranceRatio?: number;
  /**
   * Minimum silence (ms) between two subtitles for that boundary to count as
   * a scene break worth cutting at. Default 2000 (2s).
   */
  gapThresholdMs?: number;
}

/**
 * Perceptual-boundary chunking: instead of cutting every fixed `targetSize`
 * blocks, cut at the strongest scene break (largest inter-subtitle silence)
 * near the target. A chunk boundary landing on a 2s+ gap falls between scenes,
 * where dialogue context doesn't carry across anyway — so the model loses far
 * less than an arbitrary mid-conversation cut, at zero token cost (timecodes
 * are already in hand here; the composer strips them only later).
 *
 * Measured on the sample subtitles (samples/subtitles/, 461 + 1480 blocks):
 * gaps >= 2s occur roughly once every 4-5 blocks, so a ±20% window holds
 * dozens of candidate breaks and the search never fell back to a fixed cut on
 * either file. Because we take the *largest* gap in the window, real cuts land
 * on ~5-9s silences (p90), i.e. strong scene changes — which also makes the
 * method robust to the exact threshold: 1s or 3s would pick nearly the same
 * boundaries. The threshold is really just the "is any gap here worth
 * deviating from target" gate.
 *
 * When no gap clears the threshold in the window (a dialogue-dense stretch, or
 * blocks with unparseable timing), it falls back to an exact fixed cut, so the
 * worst case is never worse than chunkSrtBlocks().
 */
export function chunkSrtBlocksAtGaps(
  blocks: readonly string[],
  targetSize: number,
  options: GapChunkOptions = {},
): string[] {
  if (!Number.isInteger(targetSize) || targetSize <= 0) {
    throw new Error('targetSize must be a positive integer');
  }

  const toleranceRatio = options.toleranceRatio ?? 0.2;
  const gapThresholdMs = options.gapThresholdMs ?? 2000;
  const tolerance = Math.max(0, Math.round(targetSize * toleranceRatio));
  const minSize = Math.max(1, targetSize - tolerance);
  const maxSize = targetSize + tolerance;

  // Precompute timings once; unparseable blocks become null and can never be
  // chosen as a cut point.
  const timings = blocks.map(parseBlockTiming);

  const chunks: string[] = [];
  let start = 0;
  while (start < blocks.length) {
    const remaining = blocks.length - start;
    if (remaining <= maxSize) {
      chunks.push(blocks.slice(start).join('\n\n'));
      break;
    }

    // Boundary "after block i" is the gap between block i and block i+1. Scan
    // the window [start+minSize, start+maxSize] for the largest qualifying gap.
    let bestCut: number | null = null;
    let bestGap = gapThresholdMs;
    const from = start + minSize - 1;
    const to = Math.min(start + maxSize - 1, blocks.length - 2);
    for (let i = from; i <= to; i++) {
      const endPrev = timings[i]?.endMs;
      const startNext = timings[i + 1]?.startMs;
      if (endPrev == null || startNext == null) continue;
      const gap = startNext - endPrev;
      if (gap >= bestGap) {
        bestGap = gap;
        bestCut = i + 1;
      }
    }

    const cut = bestCut ?? start + targetSize;
    chunks.push(blocks.slice(start, cut).join('\n\n'));
    start = cut;
  }

  return chunks;
}

interface SourceBlock {
  /** Sequence number, or null when the block isn't well-formed SRT. */
  index: number | null;
  sequenceLine: string;
  timingLine: string;
  raw: string;
}

function readSourceBlock(raw: string): SourceBlock {
  const lines = raw.split('\n');
  const sequenceLine = lines[0]?.trim() ?? '';
  const timingLine = lines[1]?.trim() ?? '';
  const wellFormed =
    /^\d+$/.test(sequenceLine) && TIMING_LINE.test(timingLine);

  return {
    index: wellFormed ? Number(sequenceLine) : null,
    sequenceLine,
    timingLine,
    raw,
  };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
}

/**
 * Index the model's output by sequence number.
 *
 * The model is asked for `number\ntranslated text` blocks, but it doesn't
 * always oblige: it may drop the blank lines between blocks, wrap everything
 * in a code fence, emit a preamble, or echo timestamps it was told to omit.
 * So rather than splitting on blank lines, we scan for lines that can only be
 * a sequence number — one we asked for, haven't filled yet, and that moves
 * forward. Dialogue that happens to be bare digits fails at least one of
 * those tests, and a line that looks like an index but fails them is dropped
 * rather than folded into the subtitle text.
 */
function indexTranslatedBodies(
  modelOutput: string,
  expected: ReadonlySet<number>,
): Map<number, string> {
  const bodies = new Map<number, string>();
  let current: number | null = null;
  let buffer: string[] = [];
  let highest = 0;

  const flush = () => {
    if (current === null) return;
    const body = buffer.join('\n').trim();
    if (body) bodies.set(current, body);
    buffer = [];
  };

  for (const line of stripCodeFence(modelOutput).split('\n')) {
    const trimmed = line.trim();

    if (/^\d+$/.test(trimmed)) {
      const candidate = Number(trimmed);
      if (expected.has(candidate)) {
        if (candidate > highest && !bodies.has(candidate)) {
          flush();
          current = candidate;
          highest = candidate;
        }
        // Either way this line is a sequence number, not dialogue — never
        // let it reach the subtitle body.
        continue;
      }
    }

    if (current === null) continue; // preamble before the first block
    if (TIMING_LINE.test(trimmed)) continue; // echoed timestamp
    buffer.push(line);
  }
  flush();

  return bodies;
}

export interface ChunkReassembly {
  /** Full SRT blocks, timecodes restored from the source. */
  content: string;
  /** Blocks that received a translation. */
  matched: number;
  /** Blocks that kept their original text because no translation lined up. */
  unmatched: number;
  total: number;
}

/**
 * Rebuild a translated chunk from the source chunk's timecodes.
 *
 * The model never sees timestamps (we strip them to save tokens), so its
 * output can't carry them and has to be re-joined here. Matching by sequence
 * number rather than by position is what makes line shifting impossible: the
 * timecode always comes from the source block it belongs to. When the model
 * merges two subtitles or skips one, only those blocks miss out — they keep
 * their original text and everything after them stays aligned.
 */
export function reassembleTranslatedChunk(
  sourceChunk: string,
  modelOutput: string,
): ChunkReassembly {
  const sourceBlocks = parseSrtBlocks(sourceChunk).map(readSourceBlock);
  const expected = new Set(
    sourceBlocks
      .map((block) => block.index)
      .filter((index): index is number => index !== null),
  );
  const bodies = indexTranslatedBodies(modelOutput, expected);

  let matched = 0;
  const rebuilt = sourceBlocks.map((block) => {
    if (block.index === null) return block.raw;
    const body = bodies.get(block.index);
    if (!body) return block.raw;
    matched++;
    return `${block.sequenceLine}\n${block.timingLine}\n${body}`;
  });

  return {
    content: rebuilt.join('\n\n'),
    matched,
    unmatched: sourceBlocks.length - matched,
    total: sourceBlocks.length,
  };
}

export function buildOutputFilename(
  originalName: string,
  targetLanguage: string,
): string {
  const suffix =
    LANG_SUFFIX[targetLanguage] ??
    targetLanguage.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 10) ??
    'translated';

  return originalName.replace(/\.srt$/i, `.${suffix || 'translated'}.srt`);
}
