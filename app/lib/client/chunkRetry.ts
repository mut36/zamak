import { RETRY } from '../../config/constants';
import { parseSrtBlocks } from '../srt';
import {
  classifyError,
  isFatalCode,
  isRetryableCode,
  TranslationError,
  type FatalErrorCode,
} from '../translationErrors';

export interface ChunkOutcome {
  content: string;
  /** Blocks within this chunk that fell back to original text. */
  unmatchedBlocks: number;
  /** Sequence numbers of those blocks — what the recovery sweep re-sends. */
  unmatchedIndices: number[];
}

export type TranslateFn = (
  chunk: string,
  signal: AbortSignal,
) => Promise<ChunkOutcome>;

/**
 * Shared, mutable across every chunk in one file's translate() call — this is
 * what makes the retry budget and the fatal-stop signal *global* rather than
 * per-chunk. Passing the same object into every translateChunkWithRetry call
 * is what lets 40 chunks agree on "3 retries left" and "quota already hit".
 */
export interface RetryState {
  /** Remaining extra (retry/split) calls allowed for the whole file. */
  budget: number;
  /** Set once a fatal (quota/auth) error is seen anywhere in the file. */
  fatalCode: FatalErrorCode | null;
}

/**
 * Attempts one chunk under the shared retry/fallback policy (docs/decisions.md
 * §2-2, docs/translation-pipeline.md §9.6):
 *  - `quota`/`auth`: marks `state` fatal and re-throws — every chunk not yet
 *    started will see `state.fatalCode` set and skip straight to fallback
 *    without spending a network call.
 *  - `transient`/`align`: one plain retry, if the shared budget allows.
 *  - `oversize`: one split-in-half-and-retry, if the budget allows and the
 *    chunk has more than one block; a failure of the split falls back on the
 *    ORIGINAL error (and original whole chunk), not the split's.
 *  - anything else (`safety`, `unknown`), or a retry/split that fails too: the
 *    error is re-thrown as-is so the caller keeps the original chunk text.
 *
 * A genuine user cancellation (the caller's own AbortSignal firing) always
 * propagates immediately, bypassing every retry.
 */
export async function translateChunkWithRetry(
  chunk: string,
  signal: AbortSignal,
  translate: TranslateFn,
  state: RetryState,
): Promise<ChunkOutcome> {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
  if (state.fatalCode) {
    throw new TranslationError(
      'Skipped: a fatal error already stopped this job',
      state.fatalCode,
    );
  }

  try {
    return await translate(chunk, signal);
  } catch (error) {
    if (signal.aborted) throw error; // user cancellation — never retried

    const code = classifyError(error);

    if (isFatalCode(code)) {
      state.fatalCode = code;
      throw error;
    }

    if (code === 'oversize' && state.budget > 0) {
      const blocks = parseSrtBlocks(chunk);
      if (blocks.length > 1) {
        state.budget--;
        const mid = Math.ceil(blocks.length / 2);
        try {
          const [first, second] = await Promise.all([
            translate(blocks.slice(0, mid).join('\n\n'), signal),
            translate(blocks.slice(mid).join('\n\n'), signal),
          ]);
          return {
            content: `${first.content}\n\n${second.content}`,
            unmatchedBlocks: first.unmatchedBlocks + second.unmatchedBlocks,
            unmatchedIndices: [
              ...first.unmatchedIndices,
              ...second.unmatchedIndices,
            ],
          };
        } catch (splitError) {
          if (signal.aborted) throw splitError;
          const splitCode = classifyError(splitError);
          if (isFatalCode(splitCode)) state.fatalCode = splitCode;
          throw error; // original oversize error, not the split's
        }
      }
      throw error;
    }

    if (isRetryableCode(code) && state.budget > 0) {
      state.budget--;
      await new Promise((resolve) => setTimeout(resolve, RETRY.BASE_DELAY_MS));
      try {
        return await translate(chunk, signal);
      } catch (retryError) {
        if (signal.aborted) throw retryError;
        const retryCode = classifyError(retryError);
        if (isFatalCode(retryCode)) state.fatalCode = retryCode;
        throw retryError;
      }
    }

    throw error;
  }
}
