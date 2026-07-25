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

/** Inverse of hmsToMs: render a millisecond count as `HH:MM:SS,mmm`. */
function msToHms(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const millis = ms % 1000;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
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
/**
 * Visible character count of a block's body: sequence + timing lines dropped,
 * style tags stripped, line breaks not counted, counted by code point.
 */
function visibleCharCount(raw: string): number {
  const body = raw.split('\n').slice(2).join('\n');
  const visible = body.replace(STYLE_TAG, '').replace(/\n/g, '').trim();
  return [...visible].length;
}

export function computeCps(raw: string): CpsResult | null {
  const timing = parseBlockTiming(raw);
  if (!timing) return null;

  const durationMs = timing.endMs - timing.startMs;
  const charCount = visibleCharCount(raw);
  const cps = durationMs > 0 ? charCount / (durationMs / 1000) : null;

  return { durationMs, charCount, cps };
}

export interface TimingAdjustOptions {
  /**
   * Hard reading-speed ceiling (characters per second). Only blocks reading
   * faster than this are adjusted; blocks at or under it are left untouched.
   * Default 12.
   */
  cpsHardMax?: number;
  /**
   * Reading speed (characters per second) a widened block aims to reach — the
   * fast edge of the comfortable band. A triggered block is extended down
   * toward this, or as close as the free gaps allow. Default 10.
   */
  cpsTarget?: number;
  /** Minimum silence (ms) kept between two adjacent subtitles after adjusting. */
  minGapMs?: number;
}

/**
 * Widen the on-screen window of subtitles that read too fast (cps > hard max),
 * pulling them down toward the target cps, borrowing only from the silent gaps
 * their neighbours leave free.
 *
 * Runs once over the whole, in-order file so it also protects chunk-boundary
 * neighbours. A single forward pass keeps overlaps impossible: each block's new
 * start respects the previous block's *already-adjusted* end (+minGap), and its
 * new end respects the next block's *original* start (−minGap). That asymmetry
 * means two neighbours can never both claim the same millisecond of silence —
 * for any pair, start_{i+1} >= end_i + minGap > end_i.
 *
 * Windows only ever grow, never shrink (we only add time to fast blocks). The
 * deficit is filled by pushing the end later first (holding the line longer
 * reads more naturally than an early lead-in), then pulling the start earlier;
 * when the surrounding gaps are too small it reduces cps as far as they allow
 * rather than forcing the target. The first block can pull its start back into
 * the free pre-roll before it (down to 0); blocks with unparseable timing are
 * passed through untouched and act as hard walls that block extension into them.
 *
 * Timecodes are the only thing rewritten — sequence numbers and body text are
 * left exactly as-is, so the block count is preserved.
 */
export function adjustSubtitleTiming(
  srt: string,
  options: TimingAdjustOptions = {},
): string {
  const cpsHardMax = options.cpsHardMax ?? 12;
  const cpsTarget = options.cpsTarget ?? 10;
  const minGapMs = Math.max(0, options.minGapMs ?? 84);

  const blocks = parseSrtBlocks(srt);
  const timings = blocks.map(parseBlockTiming);

  // End of the last block we finalized, the lower wall for the next block's
  // start. Starts at 0 — the free pre-roll before the first subtitle is
  // borrowable — and resets to null after an unparseable block, whose unknown
  // span the following block must not cross.
  let prevEnd: number | null = 0;

  const rewritten = blocks.map((raw, i) => {
    const timing = timings[i];
    if (!timing) {
      prevEnd = null;
      return raw;
    }

    let { startMs, endMs } = timing;
    const durationMs = endMs - startMs;
    const charCount = visibleCharCount(raw);
    const cps = durationMs > 0 ? charCount / (durationMs / 1000) : Infinity;

    if (cps > cpsHardMax && charCount > 0) {
      const requiredMs = (charCount / cpsTarget) * 1000;
      let deficit = Math.max(0, requiredMs - durationMs);

      // Extend the end first, up to just before the next block's ORIGINAL start.
      const nextStart = timings[i + 1]?.startMs;
      const endCeiling = nextStart == null ? endMs : nextStart - minGapMs;
      if (deficit > 0 && endCeiling > endMs) {
        const grow = Math.min(deficit, endCeiling - endMs);
        endMs += grow;
        deficit -= grow;
      }

      // Then pull the start earlier, no earlier than the PREVIOUS block's
      // already-adjusted end.
      const startFloor = prevEnd == null ? startMs : prevEnd + minGapMs;
      if (deficit > 0 && startFloor < startMs) {
        const grow = Math.min(deficit, startMs - startFloor);
        startMs -= grow;
        deficit -= grow;
      }
    }

    prevEnd = endMs;

    const lines = raw.split('\n');
    lines[1] = `${msToHms(startMs)} --> ${msToHms(endMs)}`;
    return lines.join('\n');
  });

  return rewritten.join('\n\n');
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

/**
 * Format a chunk for the model: timestamps dropped (the model never sees or
 * returns them — reassembleTranslatedChunk restores them from the source) and
 * each well-formed block's sequence number wrapped as a `[123]` marker instead
 * of a bare number.
 *
 * The bracket is load-bearing, not cosmetic. A bare number is genuinely
 * ambiguous once timestamps are gone — dialogue that is itself a number (a
 * subtitle whose whole line is "8." or "1999") is indistinguishable from a
 * sequence marker by shape alone. That is not a hypothetical: a real source
 * file had a scene where a character counts aloud, giving ~20 consecutive
 * blocks with bodies like "8." "9." "10.", and every one of those numbers fell
 * inside its chunk's expected sequence range — silently swallowed as a false
 * marker and its dialogue lost (see decisions.md §2-1). A bracket is not valid
 * subtitle text on its own, so `[8]` can only ever be the marker and a
 * dialogue line "8." can never be mistaken for one, regardless of what number
 * it contains.
 *
 * Malformed blocks (no parseable sequence+timing) pass through with only a
 * timestamp-shaped line stripped, since there's no reliable index to marker.
 */
export function formatBlocksForModel(content: string): string {
  return parseSrtBlocks(content)
    .map((raw) => {
      const block = readSourceBlock(raw);
      if (block.index === null) {
        return raw
          .split('\n')
          .filter((line) => !TIMING_LINE.test(line.trim()))
          .join('\n');
      }
      const body = raw.split('\n').slice(2).join('\n');
      return `[${block.index}]\n${body}`;
    })
    .join('\n\n');
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
}

const MARKER_LINE = /^\[(\d+)\]$/;

/**
 * Index the model's output by sequence number.
 *
 * The model is asked for `[number]\ntranslated text` blocks (see
 * formatBlocksForModel), but it doesn't always oblige: it may drop the blank
 * lines between blocks, wrap everything in a code fence, emit a preamble, or
 * echo timestamps it was told to omit. So rather than splitting on blank
 * lines, we scan for `[number]` marker lines. Unlike a bare digit, a bracketed
 * marker can never collide with dialogue — dialogue that happens to be a
 * number (e.g. "8.") has no brackets, so it always falls straight into the
 * body buffer, whatever value it holds.
 *
 * A marker starts a new block only when its number is one we asked for and
 * isn't already finalized and isn't the block already open (a repeated marker
 * for the in-progress block is swallowed as noise and its followers fold into
 * that same block, matching the old repeated-number behaviour). Because the
 * bracket removes the ambiguity a bare digit had, this no longer needs a
 * monotonically-increasing check — a block can legitimately start any marker
 * in `expected`, in any order, which also fixes reversed-order output folding
 * into the wrong block (decisions.md §2-1).
 */
function indexTranslatedBodies(
  modelOutput: string,
  expected: ReadonlySet<number>,
): Map<number, string> {
  const bodies = new Map<number, string>();
  let current: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current === null) return;
    const body = buffer.join('\n').trim();
    if (body) bodies.set(current, body);
    buffer = [];
  };

  for (const line of stripCodeFence(modelOutput).split('\n')) {
    const trimmed = line.trim();
    const marker = trimmed.match(MARKER_LINE);

    if (marker) {
      const candidate = Number(marker[1]);
      if (
        expected.has(candidate) &&
        candidate !== current &&
        !bodies.has(candidate)
      ) {
        flush();
        current = candidate;
      }
      // A bracketed line is a marker, never dialogue — never let it reach the
      // subtitle body, whether or not it started a new block.
      continue;
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
