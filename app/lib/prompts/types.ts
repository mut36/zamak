export type PromptProvider = 'gemini';

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

/**
 * A translation prompt split by API channel: `system` carries the fixed
 * instructions (role, trust boundary, rules), `user` carries this request's
 * data (content_metadata, user_notes, subtitle_data) — the same three tags
 * the trust boundary in `system` names.
 */
export interface ComposedPrompt {
  system: string;
  user: string;
}
