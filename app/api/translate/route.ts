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
import { classifyError } from '../../lib/translationErrors';
import { recordChunkUsage } from '../../lib/server/chunkUsage';
import { parseSrtBlocks } from '../../lib/srt';
import type { TokenUsage } from '../../lib/providers';

export const maxDuration = 300;

const ZERO_USAGE: TokenUsage = { prompt: 0, cached: 0, thoughts: 0, output: 0 };

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
        { error: 'invalid_or_expired_job', code: 'auth' },
        { status: 403 },
      );
    }

    const apiKeys = getProviderApiKeys();
    // Runs on the server key; throws if GOOGLE_GENAI_API_KEY is unset.
    assertProviderConfigured(body.model, apiKeys);

    // Measured around the model call, then written after the outcome is
    // known. Recording here rather than inside translateSubtitle keeps the
    // service free of the request's identity (job, user) and means a
    // measurement failure can never reach the stream.
    const blocks = parseSrtBlocks(body.chunk).length;
    const startedAt = Date.now();
    const measure = (
      ok: boolean,
      usage: TokenUsage,
      thinkingLevel: string | null,
      errorCode?: string,
    ) =>
      void recordChunkUsage(supabase, {
        jobId: body.jobId,
        userId: auth.user.id,
        chunkIndex: body.chunkIndex,
        totalChunks: body.totalChunks,
        phase: body.phase ?? 'main',
        blocks,
        model: body.model,
        thinkingLevel,
        usage,
        latencyMs: Date.now() - startedAt,
        ok,
        errorCode,
      });

    return createTranslationStream(async () => {
      try {
        const outcome = await translateSubtitle({
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
          castSheet: body.castSheet,
        });
        measure(true, outcome.usage, outcome.thinkingLevel);
        return outcome;
      } catch (error) {
        // A failed call still spent latency and still happened. Dropping it
        // would make the row count disagree with the retry logs.
        measure(false, ZERO_USAGE, null, classifyError(error));
        throw error;
      }
    });
  } catch (error) {
    const status =
      error instanceof RequestValidationError || error instanceof SyntaxError
        ? 400
        : 500;
    const message =
      error instanceof Error ? error.message : 'Translation request failed';
    return NextResponse.json(
      { error: message, code: classifyError(error) },
      { status },
    );
  }
}
