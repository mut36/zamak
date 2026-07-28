import { RECOVERY } from '../../config/constants';
import {
  chunkSrtBlocks,
  hasTranslatableText,
  parseSrtBlocks,
  readBlockIndex,
} from '../srt';
import { runOrderedPool } from './concurrency';
import {
  classifyError,
  isFatalCode,
  type FatalErrorCode,
} from '../translationErrors';
import type { ChunkOutcome } from './chunkRetry';

/**
 * The recovery sweep: a second pass over only the blocks that came out of the
 * main pass still holding their original text.
 *
 * The main pass leaves originals behind two different ways — a chunk that
 * errored out entirely, and a chunk that succeeded but whose model output
 * skipped or merged some of its blocks. The second kind had no recovery at all
 * before this, and is the common one: one call per chunk means a single
 * misaligned line was simply accepted.
 *
 * What makes a sweep affordable is **repacking**. The leftovers are scattered —
 * forty stragglers spread across thirty chunks — so re-running their chunks
 * would cost thirty calls to fix forty lines. Collecting the stragglers into
 * fresh dense chunks costs one. Cost tracks the number of blocks that actually
 * failed, not the number of chunks they happened to land in, which is why this
 * is affordable where simply raising the per-chunk retry budget is not (and
 * why the retry budget could never fix the second kind at all).
 *
 * Their source sequence numbers ride along unchanged, so the server-side
 * reassembly rejoins each translation to the timecode it came from exactly as
 * in the main pass. Repacking moves blocks around in the *request*; it never
 * moves a timecode.
 *
 * Bounds (docs/decisions.md §2-2): at most RECOVERY.MAX_ROUNDS rounds, at most
 * `computeSweepBudget()` calls total, and an immediate stop the first time a
 * round recovers nothing. There is deliberately no per-block path — the thing
 * that turned one bad chunk into 200 calls in the old incident — because
 * repacking makes one unnecessary: twenty leftover blocks are one call, not
 * twenty.
 */

export interface SweepOptions {
  /** The whole source file, so leftovers can be re-cut from the original. */
  sourceContent: string;
  /** The main pass's output, whole file, in order. */
  translatedContent: string;
  /** Sequence numbers that came back untranslated from the main pass. */
  leftover: readonly number[];
  chunkSize: number;
  concurrency: number;
  signal: AbortSignal;
  /** Same translate call the main pass used, minus the retry wrapper: a sweep
   * chunk that fails just leaves its blocks for the next round. */
  translate: (chunk: string, signal: AbortSignal) => Promise<ChunkOutcome>;
  /** Fires as chunks land, for the progress display. */
  onProgress?: (progress: { recovered: number; remaining: number }) => void;
  /** Ceiling on model calls for the whole sweep — computeSweepBudget() of the
   * main pass's chunk count, which only the caller knows exactly. */
  budget: number;
}

export type SweepStop =
  | 'clean' // nothing left to recover
  | 'no-progress' // a round recovered nothing; the rest won't either
  | 'budget' // ran out of sweep calls
  | 'rounds' // hit MAX_ROUNDS
  | 'fatal'; // quota/auth — no point asking again

export interface SweepResult {
  /** The file with every recovered block substituted in place. */
  content: string;
  /** Blocks that got a translation this sweep. */
  recovered: number;
  /** Sequence numbers still holding original text. */
  remaining: number[];
  /** Leftovers with nothing to translate (`♪`, numbers) — never retried, and
   * not the user's problem to fix. */
  untranslatable: number[];
  /** Model calls spent. */
  calls: number;
  stoppedBy: SweepStop;
  fatalCode: FatalErrorCode | null;
}

/**
 * Per-file ceiling on sweep calls, shaped like computeRetryBudget: a fraction
 * of the main pass rather than a flat number, so it scales with the file
 * instead of being generous for a short one and useless for a long one.
 */
export function computeSweepBudget(totalChunks: number): number {
  return Math.max(
    RECOVERY.MIN_BUDGET,
    Math.ceil(totalChunks * RECOVERY.BUDGET_RATIO),
  );
}

/** Index every well-formed block of `content` by its sequence number. */
function indexBlocks(content: string): Map<number, string> {
  const byIndex = new Map<number, string>();
  for (const raw of parseSrtBlocks(content)) {
    const index = readBlockIndex(raw);
    if (index !== null) byIndex.set(index, raw);
  }
  return byIndex;
}

export async function runRecoverySweep({
  sourceContent,
  translatedContent,
  leftover,
  chunkSize,
  concurrency,
  signal,
  translate,
  onProgress,
  budget,
}: SweepOptions): Promise<SweepResult> {
  const sourceByIndex = indexBlocks(sourceContent);
  // Output blocks are held in file order and patched in place, so blocks the
  // sweep never touches — including any whose header is too malformed to
  // index — come back out byte-identical.
  const outputBlocks = parseSrtBlocks(translatedContent);
  const positionOf = new Map<number, number>();
  outputBlocks.forEach((raw, position) => {
    const index = readBlockIndex(raw);
    if (index !== null) positionOf.set(index, position);
  });

  const untranslatable: number[] = [];
  const pending = new Set<number>();
  // Sorted so repacked chunks stay in file order — the model reads a chunk as
  // a scene, and shuffled dialogue translates worse than sparse dialogue.
  for (const index of [...new Set(leftover)].sort((a, b) => a - b)) {
    const source = sourceByIndex.get(index);
    // A leftover we can't locate in the source or can't write back to the
    // output has no round trip available; drop it rather than pay for it.
    if (source === undefined || !positionOf.has(index)) continue;
    if (!hasTranslatableText(source)) {
      untranslatable.push(index);
      continue;
    }
    pending.add(index);
  }

  let recovered = 0;
  let calls = 0;
  let fatalCode: FatalErrorCode | null = null;
  let stoppedBy: SweepStop = 'rounds';

  for (let round = 1; round <= RECOVERY.MAX_ROUNDS; round++) {
    if (pending.size === 0) {
      stoppedBy = 'clean';
      break;
    }
    if (calls >= budget) {
      stoppedBy = 'budget';
      break;
    }
    if (signal.aborted) break;

    const repacked = chunkSrtBlocks(
      [...pending].sort((a, b) => a - b).map((index) => sourceByIndex.get(index)!),
      chunkSize,
    );
    // Never start more chunks than the budget covers. Truncating means some
    // leftovers go unattempted this round, which is the intended trade: a
    // bounded bill beats a complete one.
    const affordable = repacked.slice(0, budget - calls);
    if (affordable.length < repacked.length) {
      console.warn(
        `[sweep] round ${round}: budget covers ${affordable.length}/${repacked.length} chunks; the rest keep their original text`,
      );
    }
    calls += affordable.length;

    let recoveredThisRound = 0;

    await runOrderedPool<string, null>({
      items: affordable,
      concurrency,
      signal,
      worker: async (chunk) => {
        let outcome: ChunkOutcome;
        try {
          outcome = await translate(chunk, signal);
        } catch (error) {
          if (signal.aborted) throw error; // user cancellation aborts the pool
          const code = classifyError(error);
          if (isFatalCode(code)) fatalCode = code;
          console.error('[sweep] chunk failed, blocks stay original', error);
          return null;
        }

        // Whatever came back matched is a recovery; the rest stay pending for
        // the next round (or for good).
        const stillUnmatched = new Set(outcome.unmatchedIndices);
        for (const raw of parseSrtBlocks(outcome.content)) {
          const index = readBlockIndex(raw);
          if (index === null || !pending.has(index)) continue;
          if (stillUnmatched.has(index)) continue;
          outputBlocks[positionOf.get(index)!] = raw;
          pending.delete(index);
          recovered++;
          recoveredThisRound++;
        }
        onProgress?.({ recovered, remaining: pending.size });
        return null;
      },
    });

    if (fatalCode) {
      stoppedBy = 'fatal';
      break;
    }
    if (recoveredThisRound === 0) {
      stoppedBy = 'no-progress';
      break;
    }
    if (pending.size === 0) {
      stoppedBy = 'clean';
      break;
    }
  }

  return {
    content: outputBlocks.join('\n\n'),
    recovered,
    remaining: [...pending].sort((a, b) => a - b),
    untranslatable,
    calls,
    stoppedBy,
    fatalCode,
  };
}
