import type { ChunkTranslationRequest } from '../../types/translation';
import { readTranslationEvent } from './sse';

async function requestTranslation(
  endpoint: string,
  payload: ChunkTranslationRequest,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => undefined);
    const message =
      typeof errorBody?.error === 'string'
        ? errorBody.error
        : `Server error (${response.status})`;
    throw new Error(message);
  }

  const event = await readTranslationEvent(response);
  if (event.error) throw new Error(event.error);
  if (event.translatedContent === undefined) {
    throw new Error('No translation response received');
  }
  return event.translatedContent;
}

export function requestChunkTranslation(
  payload: ChunkTranslationRequest,
  signal: AbortSignal,
): Promise<string> {
  return requestTranslation('/api/translate', payload, signal);
}
