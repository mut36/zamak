// ============================================
// Centralized configuration constants
// ============================================

import { resolveTargetLang, TARGET_LANGS } from './languages';

/**
 * Build version, shown in the footer. Kept here rather than in page.tsx so the
 * one hardcoded copy sits next to every other constant — a test pins it to
 * package.json.
 */
export const APP_VERSION = '0.19.0';

/**
 * How long a finished translation stays downloadable. The beta ships without
 * automatic cleanup, so this is what the UI promises and what the history
 * screen enforces by disabling the button — not what a cron job deletes.
 */
export const RESULT_RETENTION_DAYS = 30;

/**
 * Version of the copyright notice the user agrees to before their first
 * translation. Bump this when the wording changes materially and everyone is
 * asked again — an agreement to old wording is not an agreement to new wording.
 */
export const COPYRIGHT_NOTICE_VERSION = '2026-07-29';

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

/**
 * Pro-only chunk size (docs/decisions.md §2-15). SERVER_CHUNK_SIZE=100 above
 * was tuned down for flash to shrink the renumbering-drift/marker-corruption
 * blast radius — a safety ceiling, not a cost lever for that model. Pro's B
 * moves for a different reason: at PRO_THINKING_LEVEL=HIGH, thinking tokens
 * per chunk fall sharply as B grows (measured ~113/block at B≈120 down to
 * ~40/block at B=250-500 on a 461-block sample) because per-chunk "who are
 * these characters, what's the register" orientation cost amortizes over more
 * blocks. 250 was the harness winner: same thinking/cost as B=500 within 2%,
 * but ~half the wall-clock chunk time and 8 chunks at MAX_BLOCKS_PER_CREDIT
 * (2000/250) still fits one wave under SERVER_CONCURRENCY=16.
 *
 * Only measured up to 461 blocks (one drama episode) — full-length-film-scale
 * HIGH chunk behavior at B=250 is not yet measured, see docs/TODO.md.
 */
export const PRO_CHUNK_SIZE = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_PRO_CHUNK_SIZE,
  250,
);

/** Resolve chunk size for a translation model — Pro and flash tune B for
 *  unrelated reasons (see PRO_CHUNK_SIZE above), so they don't share a knob. */
export function chunkSizeForModel(model: string): number {
  return model === PRO_MODEL ? PRO_CHUNK_SIZE : SERVER_CHUNK_SIZE;
}

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
 *
 * ⚠️ STALE as of 2026-07-26: the pro figures above assume thoughts=0, copied
 * from flash. Real pro logs show LOW thinking is NOT free (docs/decisions.md
 * §2-4-1) — a 967-block file cost 971원 against this model's ~320원 estimate,
 * with thinking tokens alone accounting for ~58% of the bill. Pro's true
 * worst-case cost is higher than the $0.49/670원 above; re-derive from real
 * pro thoughts data before trusting this for credit pricing (see
 * decisions.md §4 item 10).
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
 * Env `PRO_THINKING_LEVEL` — default HIGH; same restart caveat as flash.
 *
 * Unlike flash, LOW is NOT free here — confirmed 2026-07-26
 * (docs/decisions.md §2-4-1, docs/tuning/gemini-limits.md §6-2). Two things
 * broke the flash-derived assumption:
 *
 * 1. The API rejects `ThinkingLevel.MINIMAL` for gemini-3.1-pro-preview
 *    outright — LOW is the actual floor for this model, not an equal
 *    alternative to MINIMAL like it is for flash.
 * 2. Even LOW reports non-zero `thoughts` most of the time: a 967-block file
 *    (10 chunks) logged thoughts of 0, 1930, 3346, 4107, 4381, 4747, 5245, 0,
 *    0, 4089 — averaging ~2,785/chunk and accounting for ~58% of that file's
 *    translation cost. This is why a theoretical ~320원 estimate came in at
 *    an actual 971원.
 *
 * MEDIUM was the default until 2026-07-28, but a same-file LOW/MEDIUM grid
 * (docs/decisions.md §2-15) found MEDIUM never beat LOW — same or worse
 * alignment-failure rate on every cell, up to 2.3x the cost — so it bought
 * nothing over LOW. Separately, the founder's own quality bar for 고급번역
 * came from an early HIGH-only prototype; a blind full-episode review this
 * session confirmed LOW/MEDIUM read as equivalent to each other and clearly
 * worse than HIGH. HIGH's cost problem (1,405원 on a drama episode at the
 * prototype's B≈120) turned out to be a small-B problem, not a HIGH problem —
 * see PRO_CHUNK_SIZE below, which is what makes HIGH affordable (~575원, same
 * file, B=250).
 *
 * The MAX_BLOCKS_PER_CREDIT cost estimate below predates this measurement and
 * reuses flash's `th=0` assumption for pro — treat that number as stale until
 * re-derived from real pro thoughts data.
 */
export const PRO_THINKING_LEVEL: ThinkingLevelName = readThinkingLevelEnv(
  'PRO_THINKING_LEVEL',
  'HIGH',
);

/** Resolve thinking level for a translation model. */
export function thinkingLevelForModel(model: string): ThinkingLevelName {
  return model === PRO_MODEL ? PRO_THINKING_LEVEL : THINKING_LEVEL;
}

/**
 * Cast-sheet extraction (glossary + speech-relation prepass, opt-in toggle in
 * InfoStep). Default provider is OpenAI GPT-5.6-luna (`decisions.md` §2-14) —
 * relation-reasoning quality beat Gemini flash-lite on clear dialogue evidence,
 * not merely cost. One call per file; still material — ~₩130 was measured on a
 * 1,100-block file under the previous Gemini flash + MEDIUM setup.
 *
 * `GLOSSARY_PROVIDER=openai|gemini` (default openai). Rollback without a
 * redeploy: set provider to gemini and `GLOSSARY_MODEL` to a Gemini model id.
 * `GLOSSARY_THINKING_LEVEL` applies only to the Gemini path (OpenAI ignores it).
 */
export type GlossaryProvider = 'openai' | 'gemini';
export const GLOSSARY_PROVIDER: GlossaryProvider =
  process.env.GLOSSARY_PROVIDER === 'gemini' ? 'gemini' : 'openai';
/** Read once at module load — set GLOSSARY_PROVIDER / GLOSSARY_MODEL before
 *  importing this module if a harness needs a non-default combo (see
 *  scripts/glossary-ab.mts). */
export const GLOSSARY_MODEL =
  process.env.GLOSSARY_MODEL ||
  (GLOSSARY_PROVIDER === 'gemini' ? FLASH_MODEL : 'gpt-5.6-luna');
/** Gemini path only — unused when `GLOSSARY_PROVIDER=openai`. */
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
 * How many TMDB search candidates to surface for user disambiguation when a
 * title/year matches more than one work (remakes, common titles). A single
 * match always skips the picker regardless of this cap.
 */
export const MAX_ENRICH_CANDIDATES = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MAX_ENRICH_CANDIDATES,
  5,
);

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
 *  - The band's lower edge (8) is not a constant: we never extend past
 *    CPS_TARGET, so nothing is ever pushed below it and no code has to know it.
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
export const MIN_SUBTITLE_GAP_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_GAP_MS,
  84,
);
export const MIN_SUBTITLE_DURATION_MS = readPositiveIntEnv(
  process.env.NEXT_PUBLIC_MIN_SUBTITLE_DURATION_MS,
  800,
);

/**
 * The band above is Korean; reading speed is script-dependent (a Latin line
 * carries far less meaning per character than a Hangul or Han one), so the
 * per-language numbers live in TargetLang.reading and this resolves them.
 * An explicitly set env var still wins — it stays the global escape hatch,
 * applying to every language at once.
 */
export function getReadingSpeed(targetLang: string): {
  cpsHardMax: number;
  cpsTarget: number;
} {
  const { reading } = resolveTargetLang(targetLang);
  return {
    cpsHardMax: process.env.NEXT_PUBLIC_CPS_HARD_MAX
      ? CPS_HARD_MAX
      : reading.hardMax,
    cpsTarget: process.env.NEXT_PUBLIC_CPS_TARGET ? CPS_TARGET : reading.target,
  };
}

/** Timing estimates (milliseconds) */
export const TIMING = {
  /** SSE heartbeat interval to prevent gateway timeout */
  HEARTBEAT_MS: 5_000,
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

/**
 * Recovery sweep: the pass that runs after the main one, re-collecting every
 * block still holding its original text and re-sending them repacked into
 * fresh chunks (see app/lib/client/recoverySweep.ts, docs/decisions.md §2-2).
 *
 * Both knobs exist to keep the 20-minute/₩5,000 incident structurally
 * impossible. Repacking already removes the incident's mechanism — scattered
 * leftovers cost one call per CHUNK, never one per block — and these cap what
 * is left: at most MAX_ROUNDS rounds, and at most BUDGET_RATIO × (main-pass
 * chunk count) calls across all of them. With the retry budget's +20% that
 * puts the worst case for a file at ~1.7× the main pass, fixed.
 *
 * A round that recovers nothing stops the sweep regardless of budget — the
 * blocks that keep failing (safety-filtered lines, say) fail the same way
 * every time, and paying to confirm that twice is waste.
 */
export const RECOVERY = {
  MAX_ROUNDS: 2,
  BUDGET_RATIO: 0.5,
  MIN_BUDGET: 2,
} as const;

/** Target-language code → output file suffix (before `.srt`). */
export const LANG_SUFFIX: Record<string, string> = {
  ...Object.fromEntries(TARGET_LANGS.map((lang) => [lang.code, lang.code])),
  // Legacy long-form values that older clients may still send.
  Korean: 'ko',
  English: 'en',
};

/**
 * Source-language codes that may appear immediately before the subtitle
 * extension in a filename (e.g. `movie.it.srt`, `movie.it.vtt`). When present,
 * `buildOutputFilename` replaces that token with the target language code
 * instead of appending (so `movie.it.vtt` → `movie.ko.srt`, not
 * `movie.it.ko.srt`). ISO 639-1 two-letter codes only — keeps `.hd` / `.tv`
 * from being treated as languages.
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
