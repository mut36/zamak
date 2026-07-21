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

  it('derives server concurrency so the largest accepted file fits in one wave', () => {
    // The rule SERVER_CONCURRENCY is derived from (chunk-size-model.md §5-2):
    // K ≥ ⌈MAX_BLOCKS_PER_CREDIT / B⌉. B is chosen on its own merits and K
    // follows — so if you raise the credit cap, this is what tells you K needs
    // recomputing. If it breaks, a max-size file silently costs two waves.
    const { chunkSize, concurrency } = getTierLimits('server');
    expect(Math.ceil(MAX_BLOCKS_PER_CREDIT / chunkSize)).toBeLessThanOrEqual(
      concurrency,
    );
  });
});
