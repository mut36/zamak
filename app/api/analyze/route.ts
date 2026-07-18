import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { composeAnalysisPrompt } from '../../lib/prompts/analysis';
import { AUX_MODEL } from '../../config/constants';

export const maxDuration = 30;

interface AnalyzeRequest {
  content: string;
  filenameHint?: string;
}

export async function POST(request: NextRequest) {
  // Free tier is BYOK-only: require the caller's key, never the server key.
  const apiKey = request.headers.get('x-gemini-key')?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API 키가 필요합니다.' },
      { status: 400 },
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
    } catch {
      console.error('Failed to parse analysis response:', result);
      return NextResponse.json(
        { error: 'Failed to parse analysis response' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Analysis failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
