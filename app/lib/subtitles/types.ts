/** Canonical cue used at the format-adapter boundary before SRT serialization. */
export type Cue = {
  /** 1-based index; reassigned on serialize. */
  index: number;
  startMs: number;
  endMs: number;
  /** Plain dialogue text (style tags already stripped). */
  text: string;
};

export type SubtitleFormat = 'srt' | 'vtt' | 'smi' | 'ass';

/** Half-open character range `[start, end)` inside `SubtitleDoc.source`. */
export type Slot = { start: number; end: number };

/**
 * Where a canonical SRT block's text and timings live in the original file.
 * This is what makes format round-tripping possible: the pipeline works on the
 * canonical SRT, and the result is written back into these exact ranges.
 */
export type CueRef = {
  /** Canonical SRT block number (1-based). */
  block: number;
  /** The dialogue text, as it appears in the source. */
  text: Slot;
  /** Timing tokens, when the format writes them explicitly (SMI has none). */
  start?: Slot;
  end?: Slot;
  /** Source timings, so a timing is only rewritten when it actually moved. */
  startMs: number;
  endMs: number;
};

/**
 * A parsed subtitle file: the original text kept verbatim as a skeleton, plus
 * the canonical SRT the rest of the pipeline works on and the map between them.
 *
 * `source` is newline-normalized (CRLF → LF, BOM dropped) but otherwise
 * untouched — slots index into it, and round-trip output is built by splicing
 * into it rather than by re-serializing, so anything the parsers don't model
 * (VTT NOTE/STYLE/REGION, ASS styles, SMI CSS) survives by construction.
 */
export type SubtitleDoc = {
  format: SubtitleFormat;
  source: string;
  /** Canonical SRT — blocks renumbered from 1, in time order. */
  srt: string;
  refs: readonly CueRef[];
  /** Whether `emitInOriginalFormat` can rebuild this document. */
  roundTrip: boolean;
};

export const SUBTITLE_EXTENSIONS = [
  'srt',
  'vtt',
  'smi',
  'sami',
  'ass',
  'ssa',
] as const;

export type SubtitleExtension = (typeof SUBTITLE_EXTENSIONS)[number];
