import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { composeAnalysisPrompt } from '../../lib/prompts/analysis';
import { AUX_MODEL } from '../../config/constants';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';

export const maxDuration = 30;

interface AnalyzeRequest {
  content: string;
  filenameHint?: string;
}

export async function POST(request: NextRequest) {
  // Signed-in only. No credit is charged: this is a cheap flash-lite call, and
  // charging for metadata a user might discard would be indefensible.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Nothing else caps this route: no credit is spent, so a signed-in loop
  // would run on our bill indefinitely. Shares the `aux` budget with
  // /api/enrich and /api/summarize.
  const limited = await enforceRateLimit('aux');
  if (!limited.ok) return limited.response;

  // Server key only — callers never supply their own.
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 },
    );
  }
  const ai = new GoogleGenAI({ apiKey });

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string' && typeof body.filenameHint !== 'string') {
    return NextResponse.json(
      { error: 'Filename or content is required' },
      { status: 400 },
    );
  }

  try {
    const prompt = await composeAnalysisPrompt({
      content: body.content,
      filenameHint: body.filenameHint,
    });
    const response = await ai.models.generateContent({
      model: AUX_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { includeThoughts: false },
        responseMimeType: 'application/json',
      },
    });

    const result = response.text ?? '';

    try {
      const cleanResult = result.replace(/```json\n?|\n?```/g, '').trim();
      const analysis = JSON.parse(cleanResult);

      return NextResponse.json({
        title: typeof analysis.title === 'string' ? analysis.title : '',
        year: typeof analysis.year === 'string' ? analysis.year : '',
      });
    } catch (parseError) {
      console.error('Failed to parse analysis response:', result);
      await reportServerError({
        userId: auth.user.id,
        route: '/api/analyze',
        error: parseError,
        status: 502,
        detail: { stage: 'parse', model: AUX_MODEL },
      });
      return NextResponse.json(
        { error: 'Failed to parse analysis response' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Analysis failed:', error);
    await reportServerError({
      userId: auth.user.id,
      route: '/api/analyze',
      error,
      status: 500,
      detail: { model: AUX_MODEL },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
