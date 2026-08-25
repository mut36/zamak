import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import { splitLongLines } from '../../lib/server/polishService';
import { judgeDialogueCandidates } from '../../lib/server/dialogueMergeService';
import type { PolishCallMeasurement } from '../../lib/server/polishService';
import type { DialogueCandidate } from '../../lib/mergeDialogue';
import { recordChunkUsage } from '../../lib/server/chunkUsage';
import { createClient } from '../../lib/supabase/server';
import { parseSrtBlocks } from '../../lib/srt';
import { FLASH_MODEL, POLISH_MAX_BLOCKS } from '../../config/constants';

export const maxDuration = 300;

/**
 * 이 라우트는 두 가지 일을 한다. 갈라 두지 않은 이유는 인증·레이트 리밋·사용량
 * 기록이 완전히 같기 때문이다 — 라우트를 하나 더 파면 "하루 N회"가 화면 하나에
 * 두 개 생긴다.
 *
 * - `task` 없음/`'split'`: 상한을 넘는 줄을 나눈다(원래 동작, 하위호환).
 * - `task: 'merge'`: 후보 쌍이 정말 두 화자의 주고받음인지 판정한다. 대사는
 *   한 글자도 안 바뀌고 번호 목록만 돌아온다.
 */
interface PolishRequest {
  task?: 'split' | 'merge';
  subset?: string;
  candidates?: unknown;
  targetLang: string;
}

/**
 * 클라이언트가 보낸 후보 목록을 신뢰하지 않고 형태를 확인한다. 이 값은 프롬프트에
 * 그대로 실리므로(`formatCandidatesForModel`) 모양이 어긋난 항목 하나가 그 청크의
 * 판정 전체를 흔든다. 하나라도 이상하면 요청 전체를 거절한다 — 조용히 걸러내면
 * 화면은 "합칠 게 없었다"로 읽고 사용자는 왜인지 모른다.
 */
function readCandidates(value: unknown): DialogueCandidate[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const candidates: DialogueCandidate[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const c = item as Record<string, unknown>;
    if (
      !Number.isInteger(c.id) ||
      !Number.isInteger(c.firstIndex) ||
      !Number.isInteger(c.secondIndex) ||
      typeof c.first !== 'string' ||
      typeof c.second !== 'string' ||
      !c.first.trim() ||
      !c.second.trim()
    ) {
      return null;
    }
    candidates.push({
      id: c.id as number,
      firstIndex: c.firstIndex as number,
      secondIndex: c.secondIndex as number,
      // 줄바꿈이 섞이면 후보 하나가 여러 줄로 퍼져 프롬프트의 형식이 깨진다.
      first: (c.first as string).replace(/\s+/g, ' ').trim(),
      second: (c.second as string).replace(/\s+/g, ' ').trim(),
    });
  }
  return candidates;
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

  if (typeof body.targetLang !== 'string') {
    return NextResponse.json(
      { error: 'targetLang is required' },
      { status: 400 },
    );
  }

  const task = body.task ?? 'split';

  const candidates = task === 'merge' ? readCandidates(body.candidates) : null;
  if (task === 'merge' && candidates === null) {
    return NextResponse.json(
      { error: 'candidates are required' },
      { status: 400 },
    );
  }

  if (task === 'split' && typeof body.subset !== 'string') {
    return NextResponse.json({ error: 'subset is required' }, { status: 400 });
  }

  // 업로드 화면이 이미 막지만 라우트는 직접 호출될 수 있으므로 여기서도 센다.
  // 후보 쌍은 블록 두 개에서 나오므로 같은 상한을 쌍 수의 두 배로 읽는다.
  const load =
    task === 'merge'
      ? candidates!.length * 2
      : parseSrtBlocks(body.subset as string).length;
  if (load > POLISH_MAX_BLOCKS) {
    return NextResponse.json(
      { error: 'file_too_large', code: 'file_too_large' },
      { status: 413 },
    );
  }

  try {
    // 규칙 적용도 크레딧을 안 쓰지만 청구서에는 남는다. job이 없으므로
    // jobId는 null이다 (마이그레이션 0017) — 이 행들이 없으면 사용량
    // 집계(supabase/api-usage.sql)가 실제보다 적게 나온다.
    const supabase = await createClient();
    const record = (m: PolishCallMeasurement) => {
      void recordChunkUsage(supabase, {
        jobId: null,
        userId: auth.user.id,
        chunkIndex: m.chunkIndex,
        totalChunks: m.totalChunks,
        phase: 'polish',
        blocks: m.blocks,
        model: m.model,
        thinkingLevel: m.thinkingLevel,
        usage: m.usage,
        latencyMs: m.latencyMs,
        ok: m.ok,
        errorCode: m.errorCode,
      });
    };

    const result =
      task === 'merge'
        ? await judgeDialogueCandidates(candidates!, body.targetLang, record)
        : await splitLongLines(body.subset as string, body.targetLang, record);
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
