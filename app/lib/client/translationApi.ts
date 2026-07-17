import type { ChunkTranslationRequest } from '../../types/translation';
import { readTranslationEvent } from './sse';

export interface TranslationApiKeys {
  /** User-provided Gemini key (BYOK); translation calls only. */
  gemini?: string;
}

function buildHeaders(apiKeys?: TranslationApiKeys): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKeys?.gemini) headers['x-gemini-key'] = apiKeys.gemini;
  return headers;
}

async function requestTranslation(
  endpoint: string,
  payload: ChunkTranslationRequest,
  signal: AbortSignal,
  apiKeys?: TranslationApiKeys,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(apiKeys),
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
  apiKeys?: TranslationApiKeys,
): Promise<string> {
  return requestTranslation('/api/translate', payload, signal, apiKeys);
}
