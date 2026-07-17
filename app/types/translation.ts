export interface MovieInfo {
  title: string;
  genre: string;
  year: string;
  country: string;
  era: string;
  notes: string;
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
