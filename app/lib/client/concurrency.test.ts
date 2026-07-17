import { describe, expect, it } from 'vitest';
import {
  runOrderedPool,
  takeContiguousResults,
} from './concurrency';

describe('runOrderedPool', () => {
  it('preserves input order despite out-of-order completion', async () => {
    const results = await runOrderedPool({
      items: [30, 5, 10],
      concurrency: 3,
      worker: async (delay, index) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return `result-${index}`;
      },
    });

    expect(results).toEqual(['result-0', 'result-1', 'result-2']);
  });

  it('stops scheduling new work after a failure', async () => {
    const started: number[] = [];

    await expect(
      runOrderedPool({
        items: [0, 1, 2, 3],
        concurrency: 1,
        worker: async (item) => {
          started.push(item);
          if (item === 1) throw new Error('failed');
          return item;
        },
      }),
    ).rejects.toThrow('failed');

    expect(started).toEqual([0, 1]);
  });

  it('keeps only the leading completed results for partial downloads', () => {
    expect(takeContiguousResults(['first', 'second', undefined, 'fourth'])).toEqual(
      ['first', 'second'],
    );
  });
});
