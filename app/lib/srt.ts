import { LANG_SUFFIX, isSourceLangCode } from '../config/constants';

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
  /**
   * Minimum on-screen duration (ms) a block must have, independent of its
   * reading speed — even an empty or very short line is widened up to this
   * floor. Default 800.
   */
  minDurationMs?: number;
}

/**
 * Widen the on-screen window of subtitles that read too fast (cps > hard max)
 * or that are simply too short (duration < minDurationMs) regardless of
 * reading speed, pulling them toward the target cps / minimum duration,
 * borrowing only from the silent gaps their neighbours leave free.
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
  const minDurationMs = Math.max(0, options.minDurationMs ?? 800);

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

    const cpsTriggered = cps > cpsHardMax && charCount > 0;
    const shortDurationTriggered = durationMs < minDurationMs;

    if (cpsTriggered || shortDurationTriggered) {
      const requiredMsForCps = cpsTriggered ? (charCount / cpsTarget) * 1000 : 0;
      const requiredMs = Math.max(requiredMsForCps, minDurationMs);
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

export interface TextRuleReport {
  /** ASCII "..."-style runs (2+ dots) normalized to a single "…". */
  ellipsisNormalized: number;
  /** Blocks whose 3rd+ line got folded into line 2 (translation_rules_ko.txt
   * rule 9 — 2-line cap). */
  linesMerged: number;
  /** Lines that had a trailing "."/"," removed (rule 7). */
  trailingPunctuationStripped: number;
}

const ELLIPSIS_RUN = /\.{2,}/g;
const TRAILING_PUNCTUATION = /[.,]\s*$/;

/**
 * Mechanically enforces the two translation rules that have exactly one
 * correct output regardless of context — translation_rules_ko.txt rule 7
 * (no trailing "."/",") and rule 9 (2-line cap per block) — plus ellipsis
 * normalization. The model is asked to follow these already, but "a rule is
 * asked for" and "a rule always holds" are different guarantees; unlike
 * line-wrap (rule 8, needs a meaning-based break point) or honorific
 * consistency (rule 5/6, needs judgment), these have no ambiguity, so code
 * can just make them true instead of hoping the model does.
 *
 * Ellipsis runs to "…" first, so the punctuation strip below never mistakes
 * a trailing-off ellipsis for a sentence-ending period — after normalization
 * there is no longer a bare "." to match at the end of one.
 *
 * Malformed blocks (no parseable timing) pass through untouched, same as
 * adjustSubtitleTiming — there's no reliable body to rewrite.
 */
export function enforceTextRules(
  srt: string,
): { content: string; report: TextRuleReport } {
  const report: TextRuleReport = {
    ellipsisNormalized: 0,
    linesMerged: 0,
    trailingPunctuationStripped: 0,
  };

  const rewritten = parseSrtBlocks(srt).map((raw) => {
    if (!parseBlockTiming(raw)) return raw;

    const lines = raw.split('\n');
    let bodyLines = lines.slice(2);

    bodyLines = bodyLines.map((line) =>
      line.replace(ELLIPSIS_RUN, () => {
        report.ellipsisNormalized++;
        return '…';
      }),
    );

    if (bodyLines.length > 2) {
      report.linesMerged += bodyLines.length - 2;
      bodyLines = [bodyLines[0], bodyLines.slice(1).join(' ')];
    }

    bodyLines = bodyLines.map((line) => {
      if (!TRAILING_PUNCTUATION.test(line)) return line;
      report.trailingPunctuationStripped++;
      return line.replace(TRAILING_PUNCTUATION, '');
    });

    return [lines[0], lines[1], ...bodyLines].join('\n');
  });

  return { content: rewritten.join('\n\n'), report };
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
 * every body line prefixed with its own `[123] ` marker.
 *
 * Two properties are load-bearing here.
 *
 * **Brackets.** A bare number is genuinely ambiguous once timestamps are gone —
 * dialogue that is itself a number (a subtitle whose whole line is "8." or
 * "1999") is indistinguishable from a sequence marker by shape alone. A real
 * source file had a scene where a character counts aloud, giving ~20
 * consecutive blocks with bodies like "8." "9." "10.", every one of which fell
 * inside its chunk's expected sequence range and was silently swallowed as a
 * false marker. A bracket is not valid subtitle text, so `[8]` can only be a
 * marker and dialogue "8." can never be mistaken for one.
 *
 * **Marker on the same line as the text, repeated per line.** The marker used
 * to sit on its own line above the body, which made it a pure-structure line
 * carrying no translatable content — and the model would occasionally just not
 * emit one. When that happened the orphaned text had nothing tying it to its
 * identity, so it was absorbed into whichever block was still open, corrupting
 * that block's body (measured: 1 in 400 blocks, twice, on different blocks).
 * Fusing the marker onto each line removes the droppable structure-only line
 * entirely: every output line proves its own identity, and a two-line subtitle
 * is just the same marker twice. See decisions.md §2-1.
 *
 * Blocks stay separated by a blank line, which the parser uses as a "this run
 * of lines ended" signal when a marker does go missing.
 *
 * Malformed blocks (no parseable sequence+timing) pass through with only a
 * timestamp-shaped line stripped, since there's no reliable index to marker.
 */
export function formatBlocksForModel(content: string): string {
  return parseSrtBlocks(content)
    .map((raw) => {
      const lines = raw.split('\n');
      const block = readSourceBlock(raw);
      if (block.index === null) {
        return lines.filter((line) => !TIMING_LINE.test(line.trim())).join('\n');
      }
      const body = lines.slice(2);
      const bodyLines = body.length > 0 ? body : [''];
      return bodyLines
        .map((line) => `[${block.index}] ${line}`.trimEnd())
        .join('\n');
    })
    .join('\n\n');
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
}

/** `[123] text` — the marker owns the line it labels; text may be empty. */
const MARKER_LINE = /^\[(\d+)\]\s?(.*)$/;

/**
 * Index the model's output by sequence number.
 *
 * Every line the model is asked for carries its own `[number] ` prefix (see
 * formatBlocksForModel), so attribution is per-line and explicit: a line's
 * identity travels with its text instead of depending on a separate structural
 * line above it. Lines sharing a marker are joined in order, which is how a
 * two-line subtitle comes back.
 *
 * The model doesn't always oblige, so three deviations are absorbed:
 *
 * - **Marker alone on its own line** (the previous wire format, and a habit
 *   the model sometimes falls back into). It matches with empty text and the
 *   lines under it attach as continuations, so old-style output still parses.
 * - **An unmarked continuation line**, i.e. the model split a subtitle across
 *   two lines but only labelled the first. It attaches to the run in progress.
 * - **A code fence, a preamble, or echoed timestamps** — dropped.
 *
 * What is deliberately *not* absorbed: text that appears after a blank line
 * with no marker of its own. A blank line separates blocks in both directions,
 * so such text is an orphan whose marker the model dropped, and there is no
 * evidence about which block it belongs to. Guessing "the block above" is what
 * used to corrupt that block's body; it is discarded instead, leaving its own
 * block to fall back to the source text and be counted as unmatched.
 *
 * Empty parts are filtered before joining, so a body can never contain a blank
 * line — which is what makes it impossible for a reassembled block to split
 * into a second, header-less block when written back out as SRT.
 */
function indexTranslatedBodies(
  modelOutput: string,
  expected: ReadonlySet<number>,
): Map<number, string> {
  const collected = new Map<number, string[]>();
  // The marker whose run of lines is still open, and whether the line just
  // read belonged to it (an intervening blank line ends the run).
  let openMarker: number | null = null;
  let runOpen = false;

  for (const line of stripCodeFence(modelOutput).split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      runOpen = false;
      continue;
    }

    const marker = trimmed.match(MARKER_LINE);
    if (marker) {
      const candidate = Number(marker[1]);
      if (expected.has(candidate)) {
        const parts = collected.get(candidate) ?? [];
        // An echoed timestamp can arrive labelled too — keep the run open so
        // the real text under it still attaches, but never keep the timestamp.
        parts.push(TIMING_LINE.test(marker[2].trim()) ? '' : marker[2]);
        collected.set(candidate, parts);
        openMarker = candidate;
        runOpen = true;
      } else {
        // A marker for a block outside this chunk — not ours to attribute.
        runOpen = false;
      }
      continue;
    }

    if (TIMING_LINE.test(trimmed)) continue; // echoed timestamp

    if (runOpen && openMarker !== null) {
      collected.get(openMarker)!.push(line);
      continue;
    }
    // Preamble, or an orphan whose marker the model dropped — discard.
  }

  const bodies = new Map<number, string>();
  for (const [index, parts] of collected) {
    const body = parts
      .map((part) => part.trimEnd())
      .filter((part) => part.trim() !== '')
      .join('\n');
    if (body) bodies.set(index, body);
  }
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
  const rawSuffix =
    LANG_SUFFIX[targetLanguage] ??
    targetLanguage.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 10);
  const suffix = rawSuffix || 'translated';

  const match = originalName.match(/^(.*)(\.srt)$/i);
  const stem = match?.[1] ?? originalName;
  const ext = match?.[2] ?? '.srt';

  // movie.it.srt → movie.ko.srt (replace known source lang)
  // movie.srt / movie.hd.srt → movie.ko.srt / movie.hd.ko.srt (append)
  const langMatch = stem.match(/\.([a-z]{2})$/i);
  if (langMatch && isSourceLangCode(langMatch[1])) {
    return `${stem.slice(0, -langMatch[0].length)}.${suffix}${ext}`;
  }
  return `${stem}.${suffix}${ext}`;
}
