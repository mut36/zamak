import { NextRequest, NextResponse } from 'next/server';
import {
  parseChunkTranslationRequest,
  RequestValidationError,
} from '../../lib/server/requestValidation';
import {
  assertProviderConfigured,
  getProviderApiKeys,
} from '../../lib/server/providerAccess';
import { createTranslationStream } from '../../lib/server/sse';
import { translateSubtitle } from '../../lib/server/translationService';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = parseChunkTranslationRequest(await request.json());
    const apiKeys = getProviderApiKeys(request);
    assertProviderConfigured(body.model, apiKeys);

    return createTranslationStream(() =>
      translateSubtitle({
        model: body.model,
        movieInfo: body.movieInfo,
        targetLanguage: body.targetLang,
        translationMode: 'chunk',
        translationStyle: body.translationStyle,
        subtitleContent: body.chunk,
        apiKeys,
        chunkPosition: {
          index: body.chunkIndex,
          total: body.totalChunks,
        },
      }),
    );
  } catch (error) {
    const status =
      error instanceof RequestValidationError || error instanceof SyntaxError
        ? 400
        : 500;
    const message =
      error instanceof Error ? error.message : 'Translation request failed';
    return NextResponse.json({ error: message }, { status });
  }
}
