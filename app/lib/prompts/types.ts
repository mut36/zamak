export type PromptProvider = 'openai' | 'claude' | 'gemini';

import type {
  MovieInfo,
  TranslationMode,
  TranslationStyle,
} from '../../types/translation';

export type { MovieInfo, TranslationMode };

export interface TranslationPromptContext {
  movieInfo: MovieInfo;
  targetLanguage: string;
  translationMode: TranslationMode;
  subtitleContent: string;
  translationStyle: TranslationStyle;
  chunkPosition?: {
    index: number;
    total: number;
  };
}
