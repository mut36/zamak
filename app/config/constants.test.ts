import { describe, it, expect } from 'vitest';
import {
  FREE_CHUNK_SIZE,
  FREE_CONCURRENCY,
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

  it('keeps free below server on both knobs to respect free-tier rate limits', () => {
    const free = getTierLimits('free');
    const server = getTierLimits('server');
    expect(free.chunkSize).toBeLessThan(server.chunkSize);
    expect(free.concurrency).toBeLessThan(server.concurrency);
  });
});
