import type { TranslationErrorCode } from '../lib/translationErrors';
import type { CastSheet } from './glossary';

export interface MovieInfo {
  title: string;
  year: string;
  notes: string;
  /** TMDB poster URL for the detected work (movie branch), when available. */
  posterUrl?: string;
  /** Legacy metadata fields — still consumed by the translation prompt when
   * present, but no longer surfaced in the Simple UI. Optional. */
  genre?: string;
  country?: string;
  era?: string;
  /** Tone & manner of dialogue (톤앤매너) — keyword field for the translation
   * prompt. Optional; not yet populated by the Simple UI. */
  tone?: string;
}

/** Content type chosen on the upload screen — drives the info-step branch. */
export type ContentType = 'movie' | 'other';

/** Final translation result, surfaced on the completion screen. */
export interface TranslationResult {
  /** Translated SRT content (for download + preview). */
  content: string;
  /** Suggested output filename, e.g. `movie_ko.srt`. */
  filename: string;
  /** Number of translated subtitle blocks. */
  lineCount: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Chunks that failed and kept their original text (0 = fully translated). */
  failedChunks?: number;
  /** Total chunks the file was split into. */
  totalChunks?: number;
  /** Subtitle blocks that individually kept their original text inside an
   * otherwise-successful chunk (model skipped/misaligned them) — distinct
   * from failedChunks, which are whole chunks that errored out. */
  fallbackBlocks?: number;
  /** Set when a fatal error (quota/auth) stopped the job before every chunk
   * was attempted; every chunk after the stopping point kept its original
   * text. Undefined when the job ran to completion (with or without
   * per-chunk/per-block fallbacks). */
  stopReason?: 'quota' | 'auth';
}

export type TranslationMode = 'chunk';
export type TranslationStyle = 'meaning' | 'cinematic';

export interface TranslationProgress {
  stage: 'idle' | 'translating' | 'finalizing' | 'done';
  currentChunk: number;
  totalChunks: number;
  estimatedRemainingMs: number;
  lastUpdateTimestamp: number;
  totalEstimateMs: number;
}

export interface TranslationRequestBase {
  movieInfo: MovieInfo;
  model?: string;
  targetLang?: string;
  translationStyle?: TranslationStyle;
  /** Optional glossary + speech-relation sheet, extracted once per file. */
  castSheet?: CastSheet;
}

export interface ChunkTranslationRequest extends TranslationRequestBase {
  chunk: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface TranslationEvent {
  translatedContent?: string;
  /** Blocks within this chunk that fell back to original text (see
   * TranslationOutcome.unmatchedBlocks server-side). */
  unmatchedBlocks?: number;
  /** Sequence numbers of those blocks, for the client's recovery sweep. */
  unmatchedIndices?: number[];
  error?: string;
  code?: TranslationErrorCode;
}
