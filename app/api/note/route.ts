import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import { extractDirectorNote } from '../../lib/server/extractDirectorNote';
import { directorNoteAppliesTo } from '../../lib/glossaryGate';
import { recordChunkUsage } from '../../lib/server/chunkUsage';
import { createClient } from '../../lib/supabase/server';
import { DEFAULT_TARGET_LANG } from '../../config/languages';

export const maxDuration = 60;

interface NoteRequest {
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
  targetLang?: string;
  /** 번역 모델 — 서버가 프로 전용 게이트를 다시 거는 데 쓴다. */
  model?: string;
}

/**
 * 연출 메모 프리패스. `/api/glossary`와 형태가 같은 이유는 같은 자리를 대신하기
 * 때문이다 — 로그인 필수, 과금 없음, 레이트 리밋 `glossary` 버킷 공유(둘은 한
 * 요청에 하나만 돈다), 프로 게이트 재확인, 실패는 빈 값으로 강등.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit('glossary');
  if (!limited.ok) return limited.response;

  let body: NoteRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ note: '' });
  }

  // 과금되지 않는 호출 중 가장 비싼 것이다(전체 자막 1회 스캔). 낡은 JS를 든
  // 브라우저가 라이트로 이걸 태우지 못하게 서버에서 한 번 더 막는다.
  if (typeof body.model !== 'string' || !directorNoteAppliesTo(body.model)) {
    return NextResponse.json({ note: '' });
  }

  try {
    const result = await extractDirectorNote(
      body.content,
      {
        title: body.movieInfo?.title ?? '',
        year: body.movieInfo?.year ?? '',
        genre: body.movieInfo?.genre,
        country: body.movieInfo?.country,
        era: body.movieInfo?.era,
        tone: body.movieInfo?.tone,
      },
      typeof body.targetLang === 'string'
        ? body.targetLang
        : DEFAULT_TARGET_LANG,
    );
    // 과금되지 않는 호출이라 여태 로그에만 남았고, 그래서 계정별 사용량
    // 집계가 실제 청구서보다 적게 나왔다. job이 아직 없으므로 jobId는 null이다
    // (마이그레이션 0017). 청크 쪽과 같이 await하지 않는다 — 측정 실패가
    // 메모를 못 돌려주게 만드는 건 측정이 없는 것보다 나쁘다.
    if (result.measurement) {
      const m = result.measurement;
      void recordChunkUsage(await createClient(), {
        jobId: null,
        userId: auth.user.id,
        chunkIndex: 1,
        totalChunks: 1,
        phase: 'note',
        blocks: m.blocks,
        model: m.model,
        thinkingLevel: m.thinkingLevel,
        usage: m.usage,
        latencyMs: m.latencyMs,
        ok: m.ok,
        errorCode: m.errorCode,
      });
    }
    return NextResponse.json({ note: result.note });
  } catch (error) {
    console.error('[note] request failed:', error);
    // 빈 메모는 "메모가 없는 파일"과 구별되지 않는다 — 그래서 여기가 관측이
    // 가장 중요한 자리다. status 200으로 남긴다: 사용자가 받는 것이 200이고,
    // 달리 적으면 에러 표와 접근 로그가 서로 어긋난다.
    await reportServerError({
      userId: auth.user.id,
      route: '/api/note',
      error,
      status: 200,
      detail: { degraded: 'empty_note' },
    });
    return NextResponse.json({ note: '' });
  }
}
