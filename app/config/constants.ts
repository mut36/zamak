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
 * Free tier — CURRENTLY UNUSED. resolveTier() always returns 'server' now that
 * BYOK is gone, so nothing reaches these. Kept because the values are still
 * correct for a Gemini free-tier key, and a signed-in-but-uncredited tier would
 * want them back (docs/tuning/chunk-size-model.md §6).
 *
 * 150 is the wall-clock optimum under free-tier limits: free RPM caps
 * concurrency at roughly D/4, cancelling the head start smaller chunks would
 * otherwise get. 6 keeps ~15% headroom under the 15 RPM ceiling (7 would sit
 * exactly on it) — Gemini sends no Retry-After and we never retry, so a 429
 * costs untranslated subtitles.
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
 * Server key knobs — what every request uses today.
 *
 * BOTH VALUES ARE UNJUSTIFIED PLACEHOLDERS. They are frozen, not derived, and
 * the honest summary (docs/tuning/chunk-size-model.md §5) is that no amount of
 * modelling picks a chunk size for us:
 *
 *   - Cost falls monotonically with B, but only 6.5% across the entire usable
 *     range, because measured thinking tokens are 0. No interior optimum.
 *   - Wall clock rises monotonically with B, and is no longer a constraint —
 *     a whole film translates in well under a minute either way.
 *   - Expected blast radius is B-INVARIANT, contrary to what this comment
 *     claimed before: losing a chunk costs B blocks, but halving B doubles the
 *     chunk count, so expected untranslated blocks ≈ p·N either way. Small B
 *     buys lower variance, not lower loss.
 *   - The only hard walls are the 65,536-token output cap (B ≤ 3,276) and the
 *     300s route timeout (B ≤ 4,097) — both ~26x away. constants.test.ts
 *     asserts these two and nothing else.
 *
 * What would actually decide B is unmeasured, and the two candidates point in
 * opposite directions: alignment-failure rate f(B) (direction unknown) and
 * cross-chunk voice consistency (favours large B, since chunks are translated
 * blind to each other). Both need the A/B harness, not arithmetic.
 *
 * History, so nobody re-derives a phantom: K=14 arrived in the initial commit
 * with no derivation, B=125 was then fitted to it via ⌈1500/14⌉, and the 1,500
 * cap it referenced is gone. The one-wave rule that briefly re-justified K was
 * dropped 2026-07-22. Treat both numbers as arbitrary-but-frozen; override via
 * env to experiment (the harness reads these too).
 */
export const SERVER_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_SIZE,
  125,
);
export const SERVER_CONCURRENCY = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CONCURRENCY,
  16,
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
 * Blocks a single credit covers. One credit buys "one title", so this has to
 * clear real films, not the average one — a typical feature is ~850 blocks but
 * a dialogue-dense arthouse film measured 1,480, which left only 20 blocks of
 * headroom under the old 1,500 cap. Raised to 2,000 (2026-07-22) because
 * exceeding it is a hard 413 with no partial-translation fallback, so the cap
 * failing is far worse than it being loose. It still stops someone from
 * spending one credit on a ten-hour concatenation.
 *
 * Cost check: a 2,000-block file runs ~$0.36 (~500 KRW) against ~$0.27 at
 * 1,480. Credit pricing has to clear the cap, not the average.
 */
export const MAX_BLOCKS_PER_CREDIT = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MAX_BLOCKS_PER_CREDIT,
  2000,
);

/**
 * How long a paid-for job stays usable, in minutes.
 *
 * A job is opened once per file and every chunk request is checked against it.
 * The window only has to outlast one translation (tens of seconds) — it exists
 * so a job id cannot be replayed indefinitely as a free pass.
 */
export const JOB_VALIDITY_MINUTES = readPositiveIntEnv(
  process.env.JOB_VALIDITY_MINUTES,
  60,
);

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
 * spends them once per request, so this looked like our largest cost lever.
 * Measurement said otherwise: on real 200-block chunks both MINIMAL and LOW
 * report thoughts=0 (docs/tuning/gemini-limits.md §6). LOW therefore costs what
 * MINIMAL costs while deliberating more, which is why it is the default.
 *
 * The model does not allow disabling thinking outright, and thinkingBudget: 0
 * is silently ignored — thinkingLevel is the knob it honours.
 *
 * Env-tunable so comparing MINIMAL/LOW/MEDIUM/HIGH for translation quality is a
 * restart rather than a code change. MEDIUM and HIGH are unmeasured; assume
 * they do spend thinking tokens until a run says otherwise.
 */
export const THINKING_LEVEL: ThinkingLevelName = (() => {
  const raw = process.env.THINKING_LEVEL?.trim().toUpperCase();
  if (!raw) return 'LOW';
  if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as ThinkingLevelName;
  }
  console.warn(`[config] Invalid THINKING_LEVEL "${raw}", using LOW`);
  return 'LOW';
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
