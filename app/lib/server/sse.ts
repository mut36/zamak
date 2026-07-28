import 'server-only';

import { TIMING } from '../../config/constants';
import { classifyError } from '../translationErrors';
import type { TranslationOutcome } from './translationService';
import type { TranslationEvent } from '../../types/translation';

function encodeEvent(
  encoder: TextEncoder,
  event: TranslationEvent,
): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function createTranslationStream(
  task: () => Promise<TranslationOutcome>,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, TIMING.HEARTBEAT_MS);

      try {
        const { content, unmatchedBlocks, unmatchedIndices } = await task();
        controller.enqueue(
          encodeEvent(encoder, {
            translatedContent: content,
            unmatchedBlocks,
            unmatchedIndices,
          }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Translation failed';
        controller.enqueue(
          encodeEvent(encoder, { error: message, code: classifyError(error) }),
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
