// ============================================
// Centralized configuration constants
// ============================================

/**
 * SRT chunking & concurrency — the two knobs for testing parallel translation.
 * Set a very large CHUNK_SIZE to force a single request (no chunking).
 * Both overridable via env for quick tuning.
 */
function readPositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[config] Invalid env value "${raw}", using ${fallback}`);
    return fallback;
  }
  return parsed;
}

/** Subtitle blocks per translation request. Default 200. */
export const CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_SIZE,
  200,
);

/** Max concurrent chunk translations. Default 14. */
export const CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CONCURRENCY,
  14,
);

/**
 * Auxiliary model for lightweight tasks (title/year analysis, web-search
 * enrichment, non-movie summarization). Kept as a single constant so a
 * model bump is a one-line change; overridable via env.
 */
export const AUX_MODEL = process.env.AUX_MODEL || 'gemini-3.1-flash-lite';

/**
 * TMDB (The Movie Database) — movie/drama metadata + posters. Server-only key
 * (never exposed to the client; the /api/tmdb route proxies all calls).
 * Get the value from TMDB → Settings → API → "API Key (v3 auth)".
 */
export const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
export const TMDB_API_BASE = 'https://api.themoviedb.org/3';
/** Poster CDN base — append a poster_path like `/abc.jpg`. w500 ≈ card size. */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
/** Preferred metadata language; overview falls back to en-US when empty. */
export const TMDB_LANGUAGE = process.env.TMDB_LANGUAGE || 'ko-KR';

/**
 * Number of leading subtitle lines sampled to summarize non-movie content.
 * Developer-tweakable via env for quick tuning.
 */
export const SUMMARY_SAMPLE_LINES = (() => {
  const raw = process.env.SUMMARY_SAMPLE_LINES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
})();

/**
 * Allowed translation models. Unified on a single Gemini model; kept as an
 * array so validation still works and adding a model later is one line.
 */
export const ALLOWED_MODELS = ['gemini-3.5-flash'] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = 'gemini-3.5-flash';

/**
 * The single translation model. Model updates are a one-line change here
 * (or via the NEXT_PUBLIC_TRANSLATION_MODEL env var).
 */
export const TRANSLATION_MODEL =
  process.env.NEXT_PUBLIC_TRANSLATION_MODEL || DEFAULT_MODEL;

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
