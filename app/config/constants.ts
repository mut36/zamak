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
 * B=100 IS AN EMPIRICAL SAFETY LIMIT, not a derived optimum — arithmetic
 * cannot pick B at all (docs/tuning/chunk-size-model.md §5: cost varies only
 * 6.5% across the whole usable range, wall clock is not a constraint, and
 * expected blast radius from a whole-chunk API failure is B-invariant).
 *
 * What arithmetic missed is a failure mode observed directly, not modelled:
 * at B=2000 the model started renumbering mid-chunk — splitting one subtitle
 * into two and shifting every following sequence number by one. Because
 * reassembleTranslatedChunk() (srt.ts) only checks that a number is expected,
 * unused, and increasing, a renumbered block passes all three checks and the
 * translation lands on the wrong timecode for the rest of the chunk — silent,
 * not caught by the matched/unmatched counters. Observed to start past ~600
 * lines in one chunk; B=500 avoided it in early testing. B=100 sits further
 * under that ceiling with a smaller blast radius pending either a recurrence
 * or the detection/repair logic sketched in docs/decisions.md §2-3.
 *
 * B=100 is also where a second, separate failure mode (a marker corrupted by
 * a stray token bleeding in from elsewhere in the same chunk — the model's
 * generation, not a parsing bug) stopped reproducing in harness runs at
 * THINKING_LEVEL=LOW. Single-run evidence, not a derived threshold; see
 * docs/decisions.md §2-3-3.
 *
 * The output cap (B ≤ 3,276) and 300s route timeout (B ≤ 4,097) are the only
 * hard walls; constants.test.ts asserts those two and nothing else, so any
 * B up to those walls here is a deliberate choice, not a constraint violation.
 *
 * K=16 was sized for B=2000 (⌈2000/2000⌉=1 chunk, K unused) and comfortably
 * covered B=200 in one wave (⌈2000/200⌉=10 ≪ 16). At B=100 a credit-cap-sized
 * file needs ⌈2000/100⌉=20 chunks, which is now *more* than K — two waves, not
 * one (our 1874-block sample already crosses this: 19 chunks > 16). The
 * one-wave rule was already abandoned as a K-derivation basis (2026-07-22,
 * below), so this isn't a regression against any live constraint — just worth
 * knowing before assuming "K is always oversized" from the B=200-era comment.
 * Raise K toward ⌈N_max/B⌉ if 1-wave latency on the largest files matters.
 *
 * History, so nobody re-derives a phantom: K=14 arrived in the initial commit
 * with no derivation, B=125 was then fitted to it via ⌈1500/14⌉, and the 1,500
 * cap it referenced is gone. The one-wave rule that briefly re-justified K was
 * dropped 2026-07-22, then B was pushed to 2000 (no chunking) the same day,
 * reverted to 500 after the renumbering bug above, then tuned through 400/300
 * to 200, then (undocumented at the time) to 150, then to 100 (2026-07-25,
 * marker-corruption harness runs). Override via env to experiment (the
 * harness reads these).
 */
export const SERVER_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_SIZE,
  100,
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
 * Cost check (2026-07-25, current B=100, pricing from docs/tuning/gemini-limits.md
 * §4): a 2,000-block file costs ~$0.32 (~440 KRW) on flash, ~$0.49 (~670 KRW) on
 * pro — worst case is pro at the cap, not flash at the average. A 1,480-block
 * file costs ~$0.23 flash / ~$0.36 pro. Pro's estimate reuses flash's measured
 * per-block token counts (chunk-size-model.md §1) since pro hasn't been
 * measured separately — treat it as directional, not exact. Credit pricing has
 * to clear the worst case (pro, at the cap), not the flash average.
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
export const AUX_MODEL = process.env.AUX_MODEL || 'gemini-3.5-flash-lite';

/**
 * Translation models offered in the UI (빠른번역 / 고급번역). Kept as an
 * array so request validation still works and adding a model later is one line.
 */
export const FLASH_MODEL = 'gemini-3.6-flash' as const;
export const PRO_MODEL = 'gemini-3.1-pro-preview' as const;

export const ALLOWED_MODELS = [FLASH_MODEL, PRO_MODEL] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = FLASH_MODEL;

/**
 * Default model for harness / env override. The UI picks explicitly via
 * 고급번역 (PRO_MODEL) / 빠른번역 (FLASH_MODEL).
 */
export const TRANSLATION_MODEL =
  process.env.NEXT_PUBLIC_TRANSLATION_MODEL || DEFAULT_MODEL;

const THINKING_LEVELS = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type ThinkingLevelName = (typeof THINKING_LEVELS)[number];

function readThinkingLevelEnv(
  envName: string,
  fallback: ThinkingLevelName,
): ThinkingLevelName {
  const raw = process.env[envName]?.trim().toUpperCase();
  if (!raw) return fallback;
  if ((THINKING_LEVELS as readonly string[]).includes(raw)) {
    return raw as ThinkingLevelName;
  }
  console.warn(`[config] Invalid ${envName} "${raw}", using ${fallback}`);
  return fallback;
}

/**
 * Thinking effort for the flash (빠른번역) path.
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
 * Env `THINKING_LEVEL` — restart the dev server after changing (read once at
 * module load). Pro uses `PRO_THINKING_LEVEL` instead.
 */
export const THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'THINKING_LEVEL',
  'LOW',
);

/**
 * Thinking effort for the Pro (고급번역) path.
 * Env `PRO_THINKING_LEVEL` — default MEDIUM; same restart caveat as flash.
 */
export const PRO_THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'PRO_THINKING_LEVEL',
  'MEDIUM',
);

/** Resolve thinking level for a translation model. */
export function thinkingLevelForModel(model: string): ThinkingLevelName {
  return model === PRO_MODEL ? PRO_THINKING_LEVEL : THINKING_LEVEL;
}

/**
 * Cast-sheet extraction (glossary + speech-relation prepass, opt-in toggle in
 * InfoStep). One call per file, so cost/latency here is negligible next to
 * per-chunk translation calls — flash (not flash-lite) for the long-context +
 * relational reasoning the task needs, MEDIUM thinking since it isn't paid
 * per chunk. Overridable via env for tuning without a redeploy.
 */
export const GLOSSARY_MODEL =
  process.env.GLOSSARY_MODEL || FLASH_MODEL;
export const GLOSSARY_THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'GLOSSARY_THINKING_LEVEL',
  'MEDIUM',
);

/**
 * Subtitle blocks sampled for cast-sheet extraction. Files under this size
 * are sent whole; larger files are evenly excerpted (names/relations are
 * scattered through a whole file, unlike summarize's leading-sample approach)
 * — see extractCastSheet.ts.
 */
export const GLOSSARY_MAX_BLOCKS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_BLOCKS,
  3000,
);

/** Hard caps on the extracted sheet — keeps the per-chunk prompt tax bounded. */
export const GLOSSARY_MAX_TERMS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_TERMS,
  40,
);
export const GLOSSARY_MAX_RELATIONS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_RELATIONS,
  16,
);
/** Rendered <glossary>/<speech_relations> text length cap, in characters. */
export const GLOSSARY_MAX_CHARS = readPositiveIntEnv(
  process.env.GLOSSARY_MAX_CHARS,
  1200,
);

/**
 * How long the translate button waits for a still-running extraction before
 * giving up and proceeding with an empty sheet. Never blocks translation —
 * only delays the first chunk request.
 */
export const GLOSSARY_WAIT_MS = readPositiveIntEnv(
  process.env.GLOSSARY_WAIT_MS,
  15000,
);

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
 * What the progress ring fills against, in milliseconds — one figure per
 * model, not a per-file derivation.
 *
 * The previous version computed this from block count, chunk size and wave
 * count off the measured generation rate (chunk-size-model.md §1). It tracked
 * wall clock well, but it quoted a different duration for every file while the
 * landing page promises one number ("30초"), so the ring and the pitch could
 * disagree on the same screen. These are the promise; the ring still eases
 * toward 99% and only a landed result reaches 100%, so a file that runs long
 * degrades into a crawl rather than a lie.
 *
 * Flash at 30s covers a full-length film today (~1,900 blocks measured at 23s,
 * experiment-log.md 2026-07-25). Pro is unmeasured — 3분 is a deliberately
 * loose placeholder, so re-measure before quoting it anywhere tighter.
 */
export const TRANSLATION_ESTIMATE_MS: Record<AllowedModel, number> = {
  [FLASH_MODEL]: 30_000,
  [PRO_MODEL]: 180_000,
};

/** Progress-ring duration for a translation model; unknown models get flash. */
export function estimateTranslationMs(model: string): number {
  return model === PRO_MODEL
    ? TRANSLATION_ESTIMATE_MS[PRO_MODEL]
    : TRANSLATION_ESTIMATE_MS[FLASH_MODEL];
}

/**
 * Reading-speed post-processing thresholds (characters per second). After a
 * file is translated and reassembled, adjustSubtitleTiming() (app/lib/srt.ts)
 * widens any block that reads faster than CPS_HARD_MAX, pulling it down toward
 * CPS_TARGET, borrowing only from the silent gaps its neighbours leave free so
 * nothing can overlap.
 *
 * Three thresholds, one recommended band (8–10) under a hard ceiling (12):
 *  - CPS_HARD_MAX (12): the ceiling — only blocks reading faster than this are
 *    touched. 12 = Netflix's Korean adult reading-speed limit.
 *  - CPS_TARGET (10): where a fixed block should land — the fast edge of the
 *    8–10 band. Aiming at the top of the band spends the least gap to reach
 *    "comfortable"; when a block can't reach it, it still gets as close as room
 *    allows.
 *  - CPS_RECOMMENDED_MIN (8): the comfortable floor. We never extend past
 *    CPS_TARGET, so nothing is ever pushed below this — it documents the band's
 *    lower edge for any future reporting.
 *
 * MIN_SUBTITLE_GAP_MS keeps a ~2-frame (24fps) silence between adjacent
 * subtitles so a widened line never visually touches the next.
 *
 * MIN_SUBTITLE_DURATION_MS (800ms) is a separate, independent floor: even a
 * block that reads comfortably slow (or has no text at all) gets widened up
 * to this minimum on-screen duration, using the same neighbour-borrowing pass.
 *
 * All env-tunable.
 */
export const CPS_HARD_MAX = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CPS_HARD_MAX,
  12,
);
export const CPS_TARGET = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CPS_TARGET,
  10,
);
export const CPS_RECOMMENDED_MIN = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CPS_RECOMMENDED_MIN,
  8,
);
export const MIN_SUBTITLE_GAP_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_GAP_MS,
  84,
);
export const MIN_SUBTITLE_DURATION_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_DURATION_MS,
  800,
);

/** Timing estimates (milliseconds) */
export const TIMING = {
  /** SSE heartbeat interval to prevent gateway timeout */
  HEARTBEAT_MS: 5_000,
  /** Delay before resetting UI after successful translation */
  SUCCESS_RESET_MS: 5_000,
} as const;

/**
 * Per-chunk request timeout on the client (ms). Matches `/api/translate`'s
 * `maxDuration = 300` — without this, a connection that stalls (rather than
 * erroring outright) hangs forever, since fetch has no default timeout.
 */
export const CHUNK_TIMEOUT_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_CHUNK_TIMEOUT_MS,
  300_000,
);

/** API retry configuration */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1_000,
} as const;

/** Target-language code → output file suffix (before `.srt`). */
export const LANG_SUFFIX: Record<string, string> = {
  ko: 'ko',
  en: 'en',
  Korean: 'ko',
  English: 'en',
};

/**
 * Source-language codes that may appear immediately before `.srt` in a
 * filename (e.g. `movie.it.srt`). When present, `buildOutputFilename`
 * replaces them with the target suffix instead of appending another code.
 * ISO 639-1 two-letter codes only — keeps `.hd` / `.tv` from being treated
 * as languages.
 */
export const SOURCE_LANG_CODES = [
  'en', 'ko', 'ja', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'nl', 'sv', 'no', 'da', 'fi', 'pl', 'cs', 'tr', 'ar', 'hi',
  'th', 'vi', 'id', 'el', 'he', 'ro', 'hu', 'bg', 'hr', 'sr',
] as const;

const SOURCE_LANG_CODE_SET = new Set<string>(SOURCE_LANG_CODES);

export function isSourceLangCode(token: string): boolean {
  return SOURCE_LANG_CODE_SET.has(token.toLowerCase());
}
