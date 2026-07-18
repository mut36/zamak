export interface MovieInfo {
  title: string;
  year: string;
  notes: string;
  /** Legacy metadata fields — still consumed by the translation prompt when
   * present, but no longer surfaced in the Simple UI. Optional. */
  genre?: string;
  country?: string;
  era?: string;
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
}

export interface ChunkTranslationRequest extends TranslationRequestBase {
  chunk: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface TranslationEvent {
  translatedContent?: string;
  error?: string;
}
