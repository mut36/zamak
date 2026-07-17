// ============================================
// Centralized configuration constants
// ============================================

/** SRT chunking & concurrency */
export const CHUNK_SIZE = (() => {
  const raw = process.env.NEXT_PUBLIC_CHUNK_SIZE;
  if (!raw) return 200;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(
      `[config] Invalid NEXT_PUBLIC_CHUNK_SIZE="${raw}", using default 120`,
    );
    return 100;
  }
  return parsed;
})();

/** Max concurrent chunk translations */
export const CONCURRENCY = 14;

/** Number of subtitle blocks sampled for genre/tone analysis */
export const ANALYSIS_BLOCKS = 50;

/** Allowed AI models */
export const ALLOWED_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gpt-5.6-terra',
  'claude-haiku-4-5-20251001',
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];
export type ModelProviderName = 'openai' | 'claude' | 'gemini';

export const DEFAULT_MODEL: AllowedModel = 'gemini-3.5-flash';

export const MODEL_PROVIDERS: Record<AllowedModel, ModelProviderName> = {
  'gemini-3.5-flash': 'gemini',
  'gemini-3.1-pro-preview': 'gemini',
  'gpt-5.6-terra': 'openai',
  'claude-haiku-4-5-20251001': 'claude',
};

export const MODEL_LABELS: Record<AllowedModel, string> = {
  'gemini-3.5-flash': 'Gemini 3 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
};

/** Timing estimates (milliseconds) */
export const TIMING = {
  /** Estimated translation time per batch — flash model */
  FLASH_BATCH_MS: 60_000,
  /** Estimated translation time per batch — pro model */
  PRO_BATCH_MS: 110_000,
  /** SSE heartbeat interval to prevent gateway timeout */
  HEARTBEAT_MS: 5_000,
  /** Delay before resetting UI after successful translation */
  SUCCESS_RESET_MS: 5_000,
} as const;

/** API retry configuration */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1_000,
} as const;

/** Language code → file suffix mapping */
export const LANG_SUFFIX: Record<string, string> = {
  ko: 'ko',
  en: 'en',
  Korean: 'ko',
  English: 'en',
};
