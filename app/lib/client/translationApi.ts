import type { ChunkTranslationRequest } from '../../types/translation';
import { readTranslationEvent } from './sse';
import {
  classifyError,
  codeForHttpStatus,
  TranslationError,
  type TranslationErrorCode,
} from '../translationErrors';
import { CHUNK_TIMEOUT_MS } from '../../config/constants';

export interface ChunkTranslationOutcome {
  content: string;
  /** Blocks within this chunk that fell back to original text — see
   * TranslationOutcome.unmatchedBlocks on the server side. */
  unmatchedBlocks: number;
  /** Sequence numbers of those blocks — what the recovery sweep re-sends. */
  unmatchedIndices: number[];
}

async function requestTranslation(
  endpoint: string,
  payload: ChunkTranslationRequest & { jobId: string },
  signal: AbortSignal,
): Promise<ChunkTranslationOutcome> {
  // fetch has no built-in timeout — a connection that stalls rather than
  // erroring would otherwise hang until the caller's own signal fires (if
  // ever). AbortSignal.any lets either the caller's cancellation or this
  // timeout end the request.
  const combinedSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(CHUNK_TIMEOUT_MS),
  ]);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: combinedSignal,
    });
  } catch (error) {
    if (signal.aborted) throw error; // caller's own cancellation — propagate as-is
    throw new TranslationError(
      error instanceof Error ? error.message : String(error),
      classifyError(error),
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined);
    const message =
      typeof errorBody?.error === 'string'
        ? errorBody.error
        : `Server error (${response.status})`;
    const code: TranslationErrorCode =
      typeof errorBody?.code === 'string'
        ? (errorBody.code as TranslationErrorCode)
        : codeForHttpStatus(response.status);
    throw new TranslationError(message, code);
  }

  const event = await readTranslationEvent(response);
  if (event.error) {
    throw new TranslationError(event.error, event.code ?? classifyError(new Error(event.error)));
  }
  if (event.translatedContent === undefined) {
    throw new TranslationError('No translation response received', 'unknown');
  }
  return {
    content: event.translatedContent,
    unmatchedBlocks: event.unmatchedBlocks ?? 0,
    unmatchedIndices: event.unmatchedIndices ?? [],
  };
}

export function requestChunkTranslation(
  payload: ChunkTranslationRequest & { jobId: string },
  signal: AbortSignal,
): Promise<ChunkTranslationOutcome> {
  return requestTranslation('/api/translate', payload, signal);
}
