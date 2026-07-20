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
