import { describe, it, expect } from 'vitest';
import {
  FLASH_MODEL,
  FREE_CHUNK_SIZE,
  FREE_CONCURRENCY,
  MAX_BLOCKS_PER_CREDIT,
  PRO_MODEL,
  SERVER_CHUNK_SIZE,
  SERVER_CONCURRENCY,
  TRANSLATION_ESTIMATE_MS,
  estimateTranslationMs,
  getTierLimits,
  resolveTier,
} from './constants';

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

describe('estimateTranslationMs', () => {
  it('quotes 30s for flash and 3 minutes for pro', () => {
    // These are the numbers the landing copy promises (i18n/simpleCopy.ts).
    // Changing either one here without changing the copy puts the ring and the
    // pitch on different figures, which is the failure this pins.
    expect(estimateTranslationMs(FLASH_MODEL)).toBe(30_000);
    expect(estimateTranslationMs(PRO_MODEL)).toBe(180_000);
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
