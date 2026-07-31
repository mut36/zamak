import type { TranslationErrorCode } from '../lib/translationErrors';
import type { CastSheet } from './glossary';

export interface MovieInfo {
  title: string;
  year: string;
  notes: string;
  /** TMDB poster URL for the detected work (movie branch), when available. */
  posterUrl?: string;
  /** Director name, from TMDB credits (movie branch). UI-facing only — never
   * fed into the translation prompt, unlike genre/era/tone below. */
  director?: string;
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

/** One downloadable rendering of the finished translation. */
export interface DownloadOption {
  /** Extension without the dot, e.g. `vtt`. Doubles as the button label. */
  extension: string;
  filename: string;
  content: string;
  mime: string;
}

/** Final translation result, surfaced on the completion screen. */
export interface TranslationResult {
  /**
   * Translated content in canonical SRT, whatever format was uploaded. This is
   * what the completion screen counts and previews; the bytes the user
   * actually receives are in `downloads`.
   */
  content: string;
  /** Suggested output filename, e.g. `movie_ko.srt`. Mirrors `downloads[0]`. */
  filename: string;
  /**
   * Renderings offered on the completion screen, best first: the uploaded
   * format when it can be rebuilt, then always SRT.
   */
  downloads: DownloadOption[];
  /** Number of translated subtitle blocks. */
  lineCount: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Chunks the main pass failed outright. Diagnostic only: the recovery
   * sweep works per block, so a "failed" chunk may be fully translated in the
   * delivered file. Never show this to the user — use fallbackBlocks. */
  failedChunks?: number;
  /** Total chunks the file was split into. */
  totalChunks?: number;
  /** Subtitle blocks still holding their original text in the delivered file,
   * after the recovery sweep. This is the one number that describes what the
   * user actually downloads (0 = fully translated). */
  fallbackBlocks?: number;
  /** Blocks the recovery sweep rescued — original after the main pass,
   * translated in the delivered file. */
  recoveredBlocks?: number;
  /** Set when a fatal error (quota/auth) stopped the job before every chunk
   * was attempted; every chunk after the stopping point kept its original
   * text. Undefined when the job ran to completion (with or without
   * per-chunk/per-block fallbacks). */
  stopReason?: 'quota' | 'auth';
}

export type TranslationMode = 'chunk';
export type TranslationStyle = 'meaning' | 'cinematic';

export interface TranslationProgress {
  stage: 'idle' | 'translating' | 'recovering' | 'finalizing' | 'done';
  currentChunk: number;
  totalChunks: number;
  estimatedRemainingMs: number;
  lastUpdateTimestamp: number;
  totalEstimateMs: number;
  /** Blocks the recovery sweep has rescued so far. Meaningful only while
   * `stage === 'recovering'` — the chunk ring is already pinned at its ceiling
   * by then, so these two are the only numbers that still move. */
  sweepRecovered: number;
  /** Blocks still holding original text, as the sweep sees it right now. */
  sweepRemaining: number;
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
