import { describe, expect, it } from 'vitest';
import { readTranslationEvent } from './sse';

function createResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe('readTranslationEvent', () => {
  it('ignores heartbeats and returns the last data event', async () => {
    const response = createResponse([
      ': heartbeat\n\n',
      'data: {"translatedContent":"first"}\n\n',
      'data: {"translatedContent":"final"}\n\n',
    ]);

    await expect(readTranslationEvent(response)).resolves.toEqual({
      translatedContent: 'final',
    });
  });

  it('handles a data event split across network chunks', async () => {
    const response = createResponse([
      'data: {"translated',
      'Content":"complete"}\n\n',
    ]);

    await expect(readTranslationEvent(response)).resolves.toEqual({
      translatedContent: 'complete',
    });
  });
});
