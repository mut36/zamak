// ============================================
// Centralized configuration constants
// ============================================

/**
 * SRT chunking & concurrency — the two knobs for parallel translation, split
 * per tier. Set a very large chunk size to force a single request (no
 * chunking). All four overridable via env for quick tuning.
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

/**
 * Translation tier. `server` = our server key, no user-visible rate ceiling —
 * everyone runs here today. `free` keeps the smaller knobs that Gemini's
 * free-tier rate limits require; it is unused until the Phase 3 login gate
 * introduces a signed-in-but-uncredited tier.
 */
export type Tier = 'free' | 'server';

/**
 * Free tier, derived in `docs/tuning/chunk-size-model.md` (calculator at
 * `scripts/chunk-model.mjs`).
 *
 * 150 is the wall-clock optimum. Subtitle body tokens don't depend on chunk
 * size, so the only things that move with it are the prompt we repeat per
 * chunk and the thinking spent per request — both favour bigger chunks — while
 * free-tier RPM caps concurrency at roughly D/4, which cancels the head start
 * smaller chunks would otherwise get. The curve is flat between 100 and 200
 * even when thinking is 5x or generation half as fast, so this survives the
 * estimates it was built on being wrong.
 *
 * 6 keeps ~15% headroom under the 15 RPM ceiling (7 would sit exactly on it).
 * Gemini sends no Retry-After and we never retry, so a 429 costs untranslated
 * subtitles — worth the margin.
 */
export const FREE_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FREE_CHUNK_SIZE,
  150,
);
export const FREE_CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_FREE_CONCURRENCY,
  6,
);

/**
 * Paid server key — the original knobs, kept under their existing env names.
 *
 * PROVISIONAL. Unlike the free values these are not derived from anything: 14
 * has been carried since the first commit as a chunking-test default. It can't
 * be derived from Gemini either, which imposes no concurrent-request limit of
 * its own (gemini-limits.md §2) and whose 1000 RPM never binds here — what
 * actually bounds paid concurrency is our own serverless concurrent-execution
 * limit, since each in-flight chunk holds a function open for the whole model
 * call, summed across all users at once rather than one.
 *
 * That number decides the chunk size too: the paid optimum is N/kmax, the
 * smallest chunk that still finishes in a single wave. Look the limit up
 * (gemini-limits.md §7-1) before the billing gate makes this path live, then
 * re-run scripts/chunk-model.mjs with kmax= to set both.
 */
export const SERVER_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_SIZE,
  200,
);
export const SERVER_CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CONCURRENCY,
  14,
);

export interface TierLimits {
  /** Subtitle blocks per translation request. */
  chunkSize: number;
  /** Max concurrent chunk translations. */
  concurrency: number;
}

export function getTierLimits(tier: Tier): TierLimits {
  return tier === 'server'
    ? { chunkSize: SERVER_CHUNK_SIZE, concurrency: SERVER_CONCURRENCY }
    : { chunkSize: FREE_CHUNK_SIZE, concurrency: FREE_CONCURRENCY };
}

/**
 * The single place that decides a request's tier. Every call now runs on the
 * server key, so this is unconditionally 'server'. Phase 3 swaps the body for a
 * session/credit lookup — nothing else needs to change.
 *
 * The 'free' tier's smaller knobs are kept because they are what Gemini's
 * free-tier rate limits require, and a signed-in-but-uncredited tier will want
 * them again.
 */
export function resolveTier(): Tier {
  return 'server';
}

/**
 * Auxiliary model for lightweight tasks (title/year analysis, web-search
 * enrichment, non-movie summarization). Kept as a single constant so a
 * model bump is a one-line change; overridable via env.
 */
export const AUX_MODEL = process.env.AUX_MODEL || 'gemini-3.1-flash-lite';

const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

/**
 * Thinking effort for every model call.
 *
 * Gemini bills thinking tokens at the *output* rate — 6× the input rate — and
 * spends them once per request, which makes this the largest single cost lever
 * we have. Subtitle translation is a mechanical 1:1 mapping that needs little
 * deliberation, so we sit at the floor. The model does not allow disabling
 * thinking outright; MINIMAL is as low as it goes.
 *
 * Env-tunable so comparing MINIMAL/LOW/MEDIUM/HIGH for translation quality is a
 * restart rather than a code change.
 */
export const THINKING_LEVEL: ThinkingLevelName = (() => {
  const raw = process.env.THINKING_LEVEL?.trim().toUpperCase();
  if (!raw) return 'MINIMAL';
  if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as ThinkingLevelName;
  }
  console.warn(`[config] Invalid THINKING_LEVEL "${raw}", using MINIMAL`);
  return 'MINIMAL';
})();

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
