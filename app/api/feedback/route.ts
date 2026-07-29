import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Max stored comment length. Longer input is truncated, not rejected — a
 *  rejected rating is a lost signal, and the signal is the point. */
const MAX_COMMENT = 2000;

/**
 * Records a rating for one finished translation.
 *
 * Upsert on job_id so re-rating replaces the previous answer instead of
 * stacking rows. RLS additionally checks the job belongs to the caller.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { jobId?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '');
  const rating = Number(body.rating);
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: 'rating must be an integer from 1 to 5' },
      { status: 400 },
    );
  }

  const comment =
    typeof body.comment === 'string' ? body.comment.slice(0, MAX_COMMENT) : null;

  const supabase = await createClient();
  const { error } = await supabase.from('feedback').upsert(
    {
      job_id: jobId,
      user_id: auth.user.id,
      rating,
      comment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'job_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
