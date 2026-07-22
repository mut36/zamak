import { describe, it, expect } from 'vitest';
import {
  FREE_CHUNK_SIZE,
  FREE_CONCURRENCY,
  MAX_BLOCKS_PER_CREDIT,
  SERVER_CHUNK_SIZE,
  SERVER_CONCURRENCY,
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

  it('lets one credit cover a file that a wave-sized batch cannot', () => {
    // Chunking must be able to reach the whole cap; K no longer has to cover
    // it in a single wave, but B still has to divide it into finite chunks.
    expect(MAX_BLOCKS_PER_CREDIT).toBeGreaterThan(
      getTierLimits('server').chunkSize,
    );
  });
});
