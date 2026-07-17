export interface OrderedPoolOptions<T, R> {
  items: readonly T[];
  concurrency: number;
  signal?: AbortSignal;
  worker: (item: T, index: number) => Promise<R>;
  onCompleted?: (completed: number, index: number, result: R) => void;
}

export async function runOrderedPool<T, R>({
  items,
  concurrency,
  signal,
  worker,
  onCompleted,
}: OrderedPoolOptions<T, R>): Promise<Array<R | undefined>> {
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('concurrency must be a positive integer');
  }

  const results = new Array<R | undefined>(items.length);
  let nextIndex = 0;
  let completed = 0;
  let firstError: unknown;

  async function runWorker() {
    while (!signal?.aborted && firstError === undefined) {
      const index = nextIndex++;
      if (index >= items.length) return;

      try {
        const result = await worker(items[index], index);
        results[index] = result;
        completed++;
        onCompleted?.(completed, index, result);
      } catch (error) {
        if (signal?.aborted && error instanceof Error && error.name === 'AbortError') {
          return;
        }
        firstError = error;
        return;
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (firstError !== undefined) throw firstError;
  return results;
}

export function takeContiguousResults<T>(
  results: readonly (T | undefined)[],
): T[] {
  const contiguous: T[] = [];
  for (const result of results) {
    if (result === undefined) break;
    contiguous.push(result);
  }
  return contiguous;
}
