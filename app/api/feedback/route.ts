import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';
import { FEEDBACK_EVENT_CODE_INAPP } from '../../config/constants';

/** Max stored comment length. Longer input is truncated, not rejected — a
 *  rejected rating is a lost signal, and the signal is the point. */
const MAX_COMMENT = 2000;

/** Each value maps to a different file in the pipeline, which is the whole
 *  reason these are chips and not free text: a complaint that has to be
 *  hand-classified is one we would never actually process. */
const ISSUE_KINDS = [
  'mistranslation',
  'speech-level',
  'naming',
  'too-long',
  'unnatural',
  'timing',
] as const;

const USABILITY = ['as-is', 'minor-edits', 'major-edits', 'unusable'] as const;

/** Enough to point at a pattern; past this it is an export, not a report. */
const MAX_REPORTED_BLOCKS = 30;

function parseIssueKinds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)].filter((kind): kind is string =>
    ISSUE_KINDS.includes(kind as (typeof ISSUE_KINDS)[number]),
  );
}

function parseReportedBlocks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter(
      (block): block is number =>
        typeof block === 'number' && Number.isInteger(block) && block > 0,
    )
    .slice(0, MAX_REPORTED_BLOCKS);
}

/**
 * Records feedback for one finished translation.
 *
 * Two callers, one row. The completion screen sends a star rating; the
 * follow-up shown on a later visit sends `usability` and what went wrong —
 * "did you actually use it?" is unanswerable at the moment the file finishes
 * downloading, which is why it is asked days later instead.
 *
 * Both upsert on job_id, and each writes only the fields it actually
 * collected: answering the follow-up must not erase the rating, and re-rating
 * must not erase the follow-up.
 *
 * `dismiss` is the third caller — the user closed the follow-up without
 * answering, recorded so it does not return on every visit forever.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '');
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const dismiss = body.dismiss === true;

  const hasRating = body.rating !== undefined && body.rating !== null;
  const rating = Number(body.rating);
  if (hasRating && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return NextResponse.json(
      { error: 'rating must be an integer from 1 to 5' },
      { status: 400 },
    );
  }

  const usability =
    typeof body.usability === 'string' &&
    USABILITY.includes(body.usability as (typeof USABILITY)[number])
      ? body.usability
      : null;

  if (!hasRating && !usability && !dismiss) {
    return NextResponse.json({ error: 'nothing to record' }, { status: 400 });
  }

  const comment =
    typeof body.comment === 'string' && body.comment
      ? body.comment.slice(0, MAX_COMMENT)
      : null;

  // Only the fields this caller collected. A key absent here is a key the
  // upsert leaves alone — that is what lets two screens write one row without
  // overwriting each other.
  const row: Record<string, unknown> = {
    job_id: jobId,
    user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  if (hasRating) row.rating = rating;
  if (comment !== null) row.comment = comment;
  if (usability) {
    row.usability = usability;
    row.issue_kinds = parseIssueKinds(body.issueKinds);
    row.reported_blocks = parseReportedBlocks(body.reportedBlocks);
  }
  if (dismiss) row.followup_dismissed_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from('feedback')
    .upsert(row, { onConflict: 'job_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 별점(rating)이든 후속설문 응답(usability)이든, 실제 피드백을 남긴
  // 최초 제출에 한해 라이트 1개를 준다. dismiss 단독 호출(나중에 버튼)은
  // 대상이 아니다. 지급이 실패해도 피드백은 이미 저장됐으므로 라우트는
  // 그대로 성공을 반환한다 — app/api/feedback/pending/route.ts의 기존
  // "실패해도 사용자 화면은 안 깨진다" 패턴과 동일하다.
  if (hasRating || usability) {
    const { error: grantError } = await supabase.rpc('grant_event_credit', {
      p_event_code: FEEDBACK_EVENT_CODE_INAPP,
      p_kind: 'lite',
    });
    if (grantError) {
      console.warn('[feedback] event credit grant failed:', grantError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
