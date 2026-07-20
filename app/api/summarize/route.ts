import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { AUX_MODEL, SUMMARY_SAMPLE_LINES } from '../../config/constants';
import { requireUser } from '../../lib/server/auth';

export const maxDuration = 30;

interface SummarizeRequest {
  /** Raw subtitle content (SRT). Only the leading portion is used. */
  content: string;
}

/** Take the first N non-empty, non-timecode subtitle lines as a sample. */
function sampleLines(content: string, limit: number): string {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^\d+$/.test(l) &&
        !/^\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(l),
    );
  return lines.slice(0, limit).join('\n');
}

export async function POST(request: NextRequest) {
  // Signed-in only; no credit charged (see /api/analyze).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Server key only — callers never supply their own.
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 },
    );
  }
  const ai = new GoogleGenAI({ apiKey });

  let body: SummarizeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sample = sampleLines(body.content ?? '', SUMMARY_SAMPLE_LINES);
  if (!sample) {
    return NextResponse.json({ summary: '' });
  }

  const prompt = `아래는 어떤 영상 자막의 앞부분입니다. 이 영상이 어떤 내용인지 한국어로 1~2문장으로 요약해줘. 번역 시 말투·톤을 잡는 데 도움이 되도록 형식(인터뷰/강연/브이로그 등)과 주제를 담아. 요약 문장만 출력하고 다른 말은 붙이지 마.

<subtitle_sample>
${sample}
</subtitle_sample>`;

  try {
    const response = await ai.models.generateContent({
      model: AUX_MODEL,
      contents: prompt,
      config: { thinkingConfig: { includeThoughts: false } },
    });
    const summary = (response.text ?? '').trim();
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Summarize failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Summarize failed' },
      { status: 500 },
    );
  }
}
