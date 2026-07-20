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
import { requireUser } from '../../lib/server/auth';
import { isJobUsable } from '../../lib/server/translationJob';
import { createClient } from '../../lib/supabase/server';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = parseChunkTranslationRequest(await request.json());

    // The credit was spent when the job opened. Proving it here is what keeps
    // this endpoint from being an unlimited free tier for anyone signed in.
    const supabase = await createClient();
    if (!(await isJobUsable(supabase, body.jobId, auth.user.id))) {
      return NextResponse.json(
        { error: 'invalid_or_expired_job' },
        { status: 403 },
      );
    }

    const apiKeys = getProviderApiKeys();
    // Runs on the server key; throws if GOOGLE_GENAI_API_KEY is unset.
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
