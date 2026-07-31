/** Everything one finished run measured on the client side. Counts and codes
 *  only — no filename, no subtitle text. */
export interface RunMetrics {
  sourceFormat: string | null;
  targetLang: string;
  totalChunks: number;
  chunkSize: number;
  concurrency: number;
  durationMs: number;
  failedChunks: number;
  fallbackBlocks: number;
  recoveredBlocks: number;
  sweepCalls: number;
  stopReason: string | null;
  glossaryTerms: number;
  relationPairs: number;
  textRules: {
    ellipsisNormalized: number;
    linesMerged: number;
    trailingPunctuationStripped: number;
  };
}

/**
 * Records what a run measured.
 *
 * Swallows every failure, like saveResult: the user has their file, and a lost
 * measurement is our problem, not theirs. Never await this on a path the
 * completion screen is waiting for.
 */
export async function sendRunMetrics(
  jobId: string,
  metrics: RunMetrics,
): Promise<void> {
  try {
    await fetch('/api/translation/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, ...metrics }),
      // The tab may be closing right after a download; this is exactly the
      // case keepalive exists for.
      keepalive: true,
    });
  } catch {
    // Measurement is never worth an error the user can see.
  }
}
