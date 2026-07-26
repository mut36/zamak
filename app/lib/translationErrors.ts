/**
 * Shared error classification for the translate-a-chunk path, used on both
 * sides of the wire: the server attaches a code when it throws, and the
 * client falls back to classifying anything that reaches it without one
 * (network failures, timeouts — errors that never got a chance to be typed
 * server-side). See docs/decisions.md §2-2 for why retries are capped by a
 * global budget instead of being unlimited or absent.
 */
export type TranslationErrorCode =
  | 'transient'
  | 'quota'
  | 'auth'
  | 'safety'
  | 'oversize'
  | 'align'
  | 'unknown';

export class TranslationError extends Error {
  constructor(
    message: string,
    readonly code: TranslationErrorCode,
  ) {
    super(message);
    this.name = 'TranslationError';
  }
}

/** Maps an HTTP status code to the error class it implies. */
export function codeForHttpStatus(status: number): TranslationErrorCode {
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500 && status < 600) return 'transient';
  return 'unknown';
}

/**
 * Classifies an error of unknown origin. TranslationErrors (already typed by
 * whoever threw them) pass through unchanged; everything else is sniffed from
 * its message, which is what a fetch failure, an aborted timeout, or a raw
 * provider SDK error looks like once it crosses the network boundary.
 */
export function classifyError(error: unknown): TranslationErrorCode {
  if (error instanceof TranslationError) return error.code;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  const statusMatch = message.match(/\((\d{3})\)/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    const code = codeForHttpStatus(status);
    if (code !== 'unknown') return code;
  }

  if (message.includes('429') || lower.includes('quota')) return 'quota';
  if (
    lower.includes('invalid_or_expired_job') ||
    lower.includes('api key not configured') ||
    lower.includes('인증')
  ) {
    return 'auth';
  }
  if (lower.includes('safety filter')) return 'safety';
  if (lower.includes('max_tokens') || lower.includes('truncated')) {
    return 'oversize';
  }
  if (lower.includes('복원하지 못했습니다')) return 'align';
  if (
    error instanceof TypeError || // fetch-level network failure
    error?.constructor?.name === 'DOMException' || // AbortSignal.timeout()
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return 'transient';
  }

  return 'unknown';
}

export type FatalErrorCode = 'quota' | 'auth';

/** Fatal codes stop the whole job — retrying more chunks would just repeat
 * the same failure at the account level, so every remaining chunk falls back
 * immediately instead of making its own doomed call. */
export function isFatalCode(code: TranslationErrorCode): code is FatalErrorCode {
  return code === 'quota' || code === 'auth';
}

/** Codes worth one plain retry — a transient blip or an alignment miss that a
 * second sample may not repeat. `oversize` is retried too, but via a split,
 * not a plain retry, so it is handled separately by the caller. */
export function isRetryableCode(code: TranslationErrorCode): boolean {
  return code === 'transient' || code === 'align';
}

/**
 * Per-file cap on extra (retry/split) calls beyond the one-per-chunk
 * baseline. Fixed at 20% of the chunk count (min 3) so the worst case is a
 * bounded +20% cost — this is what makes the 20-minute/₩5,000 incident
 * (unbounded per-block re-translation, decisions.md §2-2) structurally
 * impossible rather than merely discouraged.
 */
export function computeRetryBudget(totalChunks: number): number {
  return Math.max(3, Math.ceil(totalChunks * 0.2));
}
