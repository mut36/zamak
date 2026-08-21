import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import { extractCastSheet } from '../../lib/server/extractCastSheet';
import { glossaryAppliesTo } from '../../lib/glossaryGate';
import { EMPTY_CAST_SHEET } from '../../types/glossary';
import { DEFAULT_TARGET_LANG } from '../../config/languages';

export const maxDuration = 60;

interface GlossaryRequest {
  /** Raw subtitle content (SRT), full file. */
  content: string;
  movieInfo?: {
    title?: string;
    year?: string;
    genre?: string;
    country?: string;
    era?: string;
    tone?: string;
  };
  /** Target language code; decides the spelling language and whether a
   * formality axis is asked for at all. Defaults to Korean. */
  targetLang?: string;
  /** 번역 모델 — 서버가 프로 전용 게이트를 다시 거는 데 쓴다. */
  model?: string;
}

export async function POST(request: NextRequest) {
  // Signed-in only; no credit charged — this is an opt-in prepass, not
  // billed translation (see /api/summarize, /api/enrich for the same policy).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // Its own, tighter bucket: a full-file scan through the glossary provider is
  // the most expensive uncharged call we make, and the product asks for it
  // once per file.
  const limited = await enforceRateLimit('glossary');
  if (!limited.ok) return limited.response;

  let body: GlossaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json(EMPTY_CAST_SHEET);
  }

  // 과금되지 않는 호출 중 가장 비싼 것이다(전체 자막 1회 스캔). 프로가 아닌
  // 요청은 여기서 끝낸다 — 낡은 JS를 든 브라우저가 이걸 태우지 못하게.
  // 스푸핑은 가능하지만 실제 방어선은 레이트 리밋(5회/분)이고, 이건 사고
  // 방지용이다.
  if (typeof body.model !== 'string' || !glossaryAppliesTo(body.model)) {
    return NextResponse.json(EMPTY_CAST_SHEET);
  }

  try {
    const sheet = await extractCastSheet(body.content, {
      title: body.movieInfo?.title ?? '',
      year: body.movieInfo?.year ?? '',
      genre: body.movieInfo?.genre,
      country: body.movieInfo?.country,
      era: body.movieInfo?.era,
      tone: body.movieInfo?.tone,
    },
    // resolveTargetLang falls back to Korean for anything unknown — this
    // prepass is best-effort and must never 400 the info step.
    typeof body.targetLang === 'string' ? body.targetLang : DEFAULT_TARGET_LANG);
    return NextResponse.json(sheet);
  } catch (error) {
    console.error('[glossary] request failed:', error);
    // This route is the one place monitoring matters most, precisely because
    // the caller is told nothing: an empty sheet is indistinguishable from a
    // file with no proper nouns in it. Recorded with status 200 — that is
    // what the user gets, and pretending otherwise would make the error table
    // disagree with the access log.
    await reportServerError({
      userId: auth.user.id,
      route: '/api/glossary',
      error,
      status: 200,
      detail: { degraded: 'empty_sheet' },
    });
    // Never a hard failure for the caller — an empty sheet degrades to
    // today's behavior instead of blocking the info step.
    return NextResponse.json(EMPTY_CAST_SHEET);
  }
}
