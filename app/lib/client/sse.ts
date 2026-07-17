import type { TranslationEvent } from '../../types/translation';

export async function readTranslationEvent(
  response: Response,
): Promise<TranslationEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent: TranslationEvent | undefined;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split('\n');
    buffer = done ? '' : (lines.pop() ?? '');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        lastEvent = JSON.parse(line.slice(6)) as TranslationEvent;
      } catch {
        console.warn('[sse] Ignoring malformed data event');
      }
    }

    if (done) break;
  }

  if (!lastEvent) throw new Error('No translation response received');
  return lastEvent;
}
