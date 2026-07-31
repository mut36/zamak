import { describe, it, expect } from 'vitest';
import {
  APP_VERSION,
  FLASH_MODEL,
  FREE_CHUNK_SIZE,
  FREE_CONCURRENCY,
  MAX_BLOCKS_PER_CREDIT,
  MIN_VERIFY_MS,
  PRO_CHUNK_SIZE,
  PRO_MODEL,
  RESULT_RETENTION_DAYS,
  SERVER_CHUNK_SIZE,
  SERVER_CONCURRENCY,
  TRANSLATION_ESTIMATE_MS,
  chunkSizeForModel,
  estimateTranslationMs,
  getTierLimits,
  resolveTier,
} from './constants';

describe('APP_VERSION', () => {
  it('matches package.json so the footer never lies about the build', async () => {
    const pkg = await import('../../package.json');
    expect(APP_VERSION).toBe(pkg.default.version);
  });
});

describe('RESULT_RETENTION_DAYS', () => {
  it('is 30 — the retention promised on screen', () => {
    expect(RESULT_RETENTION_DAYS).toBe(30);
  });
});

describe('PRO_MODEL', () => {
  it('stays the exact literal the credit-tier migration hardcodes', () => {
    // supabase/migrations/0004_credit_tiers.sql picks the balance to debit with
    // a bare `p_model = 'gemini-3.1-pro-preview'` comparison, and that migration
    // is already applied in production. If PRO_MODEL drifts without the DB
    // following, every 프로 translation silently debits lite_balance instead.
    expect(PRO_MODEL).toBe('gemini-3.1-pro-preview');
  });
});

describe('resolveTier', () => {
  it('puts every request on the server tier', () => {
    expect(resolveTier()).toBe('server');
  });
});

describe('getTierLimits', () => {
  it('returns the free knobs for the free tier', () => {
    expect(getTierLimits('free')).toEqual({
      chunkSize: FREE_CHUNK_SIZE,
      concurrency: FREE_CONCURRENCY,
    });
  });

  it('returns the server knobs for the server tier', () => {
    expect(getTierLimits('server')).toEqual({
      chunkSize: SERVER_CHUNK_SIZE,
      concurrency: SERVER_CONCURRENCY,
    });
  });

  it('keeps free concurrency below server, since free-tier RPM is the binding limit', () => {
    // Only concurrency is ordered between tiers. Gemini's free RPM of 15 is a
    // hard ceiling, so free must stay well under what the server key can do.
    //
    // Chunk size is deliberately NOT compared: the two are derived from
    // unrelated constraints — free from the wall-clock optimum under RPM 15,
    // server from fitting MAX_BLOCKS_PER_CREDIT into one concurrent wave — and
    // server currently lands *below* free (100 vs 150) as a result.
    expect(getTierLimits('free').concurrency).toBeLessThan(
      getTierLimits('server').concurrency,
    );
  });

  // The one-wave rule (K ≥ ⌈MAX_BLOCKS_PER_CREDIT / B⌉) used to be asserted
  // here. Dropped 2026-07-22: extra waves cost seconds on a job that already
  // finishes well under a minute, and enforcing it pinned K to B for no
  // benefit. What remains are the only two limits that are actually derivable
  // — everything else about B is a smooth trade with no optimum
  // (docs/tuning/chunk-size-model.md §5).
  it('keeps a chunk inside the per-request output cap', () => {
    // A chunk that overruns 65,536 output tokens is truncated, which loses the
    // whole chunk — the densest window carries dens× the average, so budget
    // for that rather than the mean.
    const OUT_CAP = 65536;
    const TOKENS_PER_BLOCK = 16; // measured, chunk-size-model.md §1
    const DENSITY = 1.25; // p95 densest window vs average
    expect(
      getTierLimits('server').chunkSize * TOKENS_PER_BLOCK * DENSITY,
    ).toBeLessThan(OUT_CAP);
  });

  it('keeps a chunk inside the route timeout', () => {
    // maxDuration on /api/translate is 300s; one chunk must generate within it.
    const TIMEOUT_S = 300;
    const TOKENS_PER_BLOCK = 16;
    const TOKENS_PER_S = 220; // measured generation rate
    const TTFT_S = 2;
    const duration =
      TTFT_S + (getTierLimits('server').chunkSize * TOKENS_PER_BLOCK) / TOKENS_PER_S;
    expect(duration).toBeLessThan(TIMEOUT_S);
  });

  it('never splits an accepted file into more chunks than it has blocks', () => {
    // B currently equals the credit cap (one request per file), so this is an
    // equality today. It guards the direction that would be a bug: a chunk
    // size larger than any file we accept means the extra capacity is paid for
    // in output-cap headroom and bought nothing.
    expect(getTierLimits('server').chunkSize).toBeLessThanOrEqual(
      MAX_BLOCKS_PER_CREDIT,
    );
  });
});

describe('chunkSizeForModel', () => {
  it('gives Pro its own chunk size instead of the flash-tuned server one', () => {
    // decisions.md §2-15: SERVER_CHUNK_SIZE=100 is a flash renumbering-drift
    // safety ceiling, not a cost lever for Pro — Pro needs its own knob.
    expect(chunkSizeForModel(PRO_MODEL)).toBe(PRO_CHUNK_SIZE);
    expect(chunkSizeForModel(FLASH_MODEL)).toBe(SERVER_CHUNK_SIZE);
  });

  it('never splits a max-credit file into more Pro chunks than one wave covers', () => {
    // Same one-wave property SERVER_CHUNK_SIZE already gets checked for above
    // — MAX_BLOCKS_PER_CREDIT / PRO_CHUNK_SIZE must stay at or under
    // SERVER_CONCURRENCY so every chunk of the largest accepted file starts in
    // a single wave.
    expect(Math.ceil(MAX_BLOCKS_PER_CREDIT / PRO_CHUNK_SIZE)).toBeLessThanOrEqual(
      SERVER_CONCURRENCY,
    );
  });

  it('keeps a Pro HIGH chunk inside the route timeout', () => {
    // Measured, not derived (docs/decisions.md §2-15): Pro throughput ~105
    // tok/s (vs flash's 220, chunk-size-model.md §5-2 used flash's number by
    // mistake) and HIGH thinking ~9,500 tokens/chunk at B=250 on a 461-block
    // sample — single-run evidence, revisit if full-length-film HIGH chunks
    // measure meaningfully higher (docs/TODO.md).
    const TIMEOUT_S = 300;
    const TOKENS_PER_BLOCK = 16;
    const PRO_TOKENS_PER_S = 105;
    const PRO_HIGH_THINKING_PER_CHUNK = 9500;
    const TTFT_S = 2;
    const duration =
      TTFT_S +
      (PRO_CHUNK_SIZE * TOKENS_PER_BLOCK + PRO_HIGH_THINKING_PER_CHUNK) /
        PRO_TOKENS_PER_S;
    expect(duration).toBeLessThan(TIMEOUT_S);
  });
});

describe('estimateTranslationMs', () => {
  it('quotes 20s for flash and 3 minutes for pro', () => {
    // Both are anchored to measured runs (experiment-log.md), and the landing
    // copy quotes the same measurement (i18n/simpleCopy.ts). Moving either one
    // here without re-checking the log and the copy puts the ring, the pitch
    // and the measurement on different figures — the failure this pins.
    expect(estimateTranslationMs(FLASH_MODEL)).toBe(20_000);
    expect(estimateTranslationMs(PRO_MODEL)).toBe(165_000);
  });

  it('falls back to flash for an unrecognised model', () => {
    // The estimate feeds a progress ring, so an unknown model must still get a
    // usable duration rather than NaN or zero.
    expect(estimateTranslationMs('some-future-model')).toBe(
      estimateTranslationMs(FLASH_MODEL),
    );
  });

  it('keeps every model estimate positive and orders flash under pro', () => {
    // The estimate is the ring's denominator, so a zero would divide the fill
    // by nothing; the ordering is the user-visible promise that 빠른번역 is
    // the faster of the two buttons.
    for (const ms of Object.values(TRANSLATION_ESTIMATE_MS)) {
      expect(ms).toBeGreaterThan(0);
    }
    expect(TRANSLATION_ESTIMATE_MS[FLASH_MODEL]).toBeLessThan(
      TRANSLATION_ESTIMATE_MS[PRO_MODEL],
    );
  });
});

describe('MIN_VERIFY_MS', () => {
  // 타임코드 검증은 수십 ms에 끝나 한 프레임도 안 보였다. 최소 노출이 없으면
  // 사용자는 검증을 안 했다고 읽는다.
  it('체크가 켜지는 걸 사람이 볼 수 있을 만큼 길다', () => {
    expect(MIN_VERIFY_MS).toBeGreaterThanOrEqual(1_000);
  });

  it('기다림이 부담될 만큼 길지는 않다', () => {
    expect(MIN_VERIFY_MS).toBeLessThanOrEqual(3_000);
  });
});
