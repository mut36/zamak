import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { AUX_MODEL } from '../../config/constants';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // BYOK is optional: fall back to the server key when the caller has none.
  // Grounding (googleSearch below) only works on a billing-linked project, so
  // this route's real quality depends on the server key already being one.
  const apiKey =
    request.headers.get('x-gemini-key')?.trim() ||
    process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 },
    );
  }
  const ai = new GoogleGenAI({ apiKey });

  let body: { title: string; year?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const titleStr = body.year?.trim()
    ? `${body.title.trim()} (${body.year.trim()})`
    : body.title.trim();

  try {
    const response = await ai.models.generateContent({
      model: AUX_MODEL,
      contents: `"${titleStr}"를 인터넷에서 검색해. 마크다운 없이 아래 형식의 일반 텍스트로만 출력해.

영화나 드라마인 경우:
영화여부: 영화
감독: [감독 실명]
개봉연도: [4자리 연도]

[한국 제목 또는 음역 (원제, 개봉연도) 자막 번역 컨텍스트]

1. 톤앤매너 및 지침
- 장르/분위기: [번역 시 대사 톤에 영향을 주는 작품의 핵심 분위기 1~2줄]
- 배경: [시공간적 배경 및 문화적·사회적 특이사항]
- 번역지침: [대사 스타일(구어체/문어체), 방언·비속어 처리 방향, 고유명사 음역/의역 기준 등]

2. 인물별 말투 지침
- [인물명 1] ([직책/역할]): [존댓말/반말 여부, 성격이 드러나는 대사 스타일]
- [인물명 2] ([직책/역할]): [존댓말/반말 여부, 성격이 드러나는 대사 스타일]
- [인물명 3] ([직책/역할]): [존댓말/반말 여부, 성격이 드러나는 대사 스타일]
*(필요한 만큼 인물 추가)*

영화/드라마가 아니거나 정보를 찾을 수 없으면:
영화여부: 없음
감독: 없음`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = (response.text ?? '').trim();
    const lines = text.split('\n');

    const movieStatus = (lines[0] ?? '').replace('영화여부:', '').trim();
    const director = (lines[1] ?? '').replace('감독:', '').trim();
    const yearRaw = (lines[2] ?? '').replace('개봉연도:', '').trim();
    const year = /^\d{4}$/.test(yearRaw) ? yearRaw : '';
    const isMovie =
      !movieStatus.includes('없음') &&
      movieStatus.length > 0 &&
      !director.includes('없음');
    const notes = isMovie ? lines.slice(4).join('\n').trim() : '';

    return NextResponse.json({
      isMovie,
      director: isMovie ? director : null,
      year: isMovie ? year : null,
      notes,
    });
  } catch (error) {
    console.error('Enrichment failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
