import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import { splitLongLines } from '../../lib/server/polishService';
import { parseSrtBlocks } from '../../lib/srt';
import { FLASH_MODEL, POLISH_MAX_BLOCKS } from '../../config/constants';

export const maxDuration = 300;

interface PolishRequest {
  subset: string;
  targetLang: string;
}

export async function POST(request: NextRequest) {
  // 진짜 벽. 익명 인터넷과 우리 Gemini 요금 사이는 여기서 닫힌다.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // 크레딧을 안 쓰는 라우트라 이 한도가 유일한 천장이다 — /api/translate는
  // job의 크레딧 검사가 그 자리를 맡는다. /api/glossary와 같은 조건(무료 + AI)
  // 이므로 같은 배선을 쓴다. requireUser 다음이어야 한다: 카운터가 RPC 안에서
  // auth.uid()로 매겨지므로 익명 요청은 쓸 예산 자체가 없다.
  const limited = await enforceRateLimit('polish');
  if (!limited.ok) return limited.response;

  // 서버 키 전용 — 호출자가 자기 키를 넣는 경로는 없다.
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 },
    );
  }

  let body: PolishRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.subset !== 'string' || typeof body.targetLang !== 'string') {
    return NextResponse.json(
      { error: 'subset and targetLang are required' },
      { status: 400 },
    );
  }

  // 업로드 화면이 이미 막지만 라우트는 직접 호출될 수 있으므로 여기서도 센다.
  if (parseSrtBlocks(body.subset).length > POLISH_MAX_BLOCKS) {
    return NextResponse.json(
      { error: 'file_too_large', code: 'file_too_large' },
      { status: 413 },
    );
  }

  try {
    const result = await splitLongLines(body.subset, body.targetLang);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Polish failed:', error);
    await reportServerError({
      userId: auth.user.id,
      route: '/api/polish',
      error,
      status: 500,
      detail: { model: FLASH_MODEL },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Polish failed' },
      { status: 500 },
    );
  }
}
