import { describe, it, expect } from 'vitest';
import {
  FREE_CHUNK_SIZE,
  FREE_CONCURRENCY,
  MAX_BLOCKS_PER_CREDIT,
  SERVER_CHUNK_SIZE,
  SERVER_CONCURRENCY,
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
    // server currently lands *below* free (125 vs 150) as a result.
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
  const { chunkSize, concurrency } = getTierLimits('server');

  // These two pin the formula itself with an explicit chunkSize large enough
  // to hold the whole file in one chunk (i.e. the one-request-per-file case),
  // rather than SERVER_CHUNK_SIZE — that config has changed twice already
  // (chunk-size-model.md §5-6, §8) and a fixed value keeps this test honest
  // about what it is actually asserting.
  const ONE_CHUNK = 5000;

  it('scales with file size when the file fits in a single chunk', () => {
    // The bug this replaced: a flat per-wave constant meant a 400-block file
    // and a 2,000-block file were quoted the same 60s, so the ring either
    // finished early and stalled at 99% or crawled far behind the result.
    const short = estimateTranslationMs(400, ONE_CHUNK, concurrency);
    const long = estimateTranslationMs(2000, ONE_CHUNK, concurrency);
    expect(long).toBeGreaterThan(short * 2);
  });

  it('tracks the measured generation rate for a single chunk', () => {
    // 2,000 blocks x 16 tokens / 220 tok/s + 2s TTFT ~= 147s.
    expect(
      estimateTranslationMs(2000, ONE_CHUNK, concurrency),
    ).toBeGreaterThan(120_000);
    expect(estimateTranslationMs(2000, ONE_CHUNK, concurrency)).toBeLessThan(
      180_000,
    );
  });

  it('does not balloon with file size once chunks run in parallel', () => {
    // The other side of the coin: even the largest file we accept should
    // finish in a handful of waves rather than scaling linearly with N — that
    // is what chunking buys over the one-request-per-file config this
    // replaced (chunk-size-model.md §5-6).
    expect(
      estimateTranslationMs(MAX_BLOCKS_PER_CREDIT, chunkSize, concurrency),
    ).toBeLessThan(60_000);
  });

  it('charges extra waves only once concurrency is exhausted', () => {
    // Small B stays reachable via env override, so the wave term has to keep
    // working. At B=50, K=16: 800 blocks is 16 chunks (one wave) and 850 is 17
    // (two). Chunks inside a wave run in parallel, so 400 and 800 blocks cost
    // the same wall clock — that is the property being pinned, not monotonicity
    // in file size.
    const oneWave = estimateTranslationMs(800, 50, 16);
    expect(estimateTranslationMs(400, 50, 16)).toBe(oneWave);
    expect(estimateTranslationMs(850, 50, 16)).toBe(oneWave * 2);
  });

  it('never returns zero for a tiny file', () => {
    expect(estimateTranslationMs(1, chunkSize, concurrency)).toBeGreaterThan(0);
  });
});
