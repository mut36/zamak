import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { reportServerError } from '../../../lib/server/reportError';
import { ALLOWED_MODELS, creditsForBlocks } from '../../../config/constants';

/**
 * Opens a translation job, spending credits.
 *
 * This is the only place credits are consumed. Charging here rather than in
 * /api/translate is what keeps the cost tied to the *file*: a film is
 * translated as a dozen parallel chunk requests, and charging per request
 * would empty an account on a single movie.
 *
 * How many credits is `creditsForBlocks(totalBlocks)` — but this route does not
 * compute the charge, it only reports it. `begin_translation_job` re-derives
 * the same number in SQL from the block count it was handed, because a client
 * that could name its own price would name 1.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { totalBlocks?: unknown; model?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const totalBlocks = Number(body.totalBlocks);
  if (!Number.isInteger(totalBlocks) || totalBlocks <= 0) {
    return NextResponse.json(
      { error: 'A positive totalBlocks is required' },
      { status: 400 },
    );
  }

  // The model decides which balance is spent, so an unrecognised id must be
  // refused here rather than silently defaulting — a typo would otherwise
  // charge the lite balance for a pro run.
  const model = String(body.model ?? '');
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    return NextResponse.json(
      { error: 'A known model is required' },
      { status: 400 },
    );
  }

  // No size ceiling. Until 2026-08-21 anything over 2,000 blocks was a 413
  // with no way forward — a dead end for exactly the professional translators
  // who bring long files. A long file now spends more credits instead.

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('begin_translation_job', {
    p_total_blocks: totalBlocks,
    p_model: model,
  });

  if (error) {
    // The function raises this when that balance is already zero. It is an
    // expected outcome, not a fault, so it gets its own status and code — and
    // carries which balance ran out, so the screen names the right one.
    if (error.message.includes('insufficient credits')) {
      // Shape raised by 0015: `insufficient credits: <kind> need <n> have <n>`.
      // Both numbers come from inside the same transaction that failed, so the
      // screen can say "2장이 필요한데 1장" without a second query that could
      // read a balance the refusal never saw. A message the regex does not
      // recognise still gets the right screen — kind falls back to the
      // substring test, and the counts are simply omitted.
      const detail = /insufficient credits: (pro|lite) need (\d+) have (\d+)/.exec(
        error.message,
      );
      return NextResponse.json(
        {
          error: 'insufficient_credits',
          kind: detail?.[1] ?? (error.message.includes('pro') ? 'pro' : 'lite'),
          ...(detail
            ? { required: Number(detail[2]), have: Number(detail[3]) }
            : {}),
        },
        { status: 402 },
      );
    }
    // Anything that is not "you are out of credits" means the credit ledger
    // itself refused, and the user is stopped at the start of a paid action.
    await reportServerError({
      userId: auth.user.id,
      route: '/api/translation/begin',
      error,
      status: 500,
      detail: { model, totalBlocks },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The charge is echoed back so the screen can name what was just spent
  // without recomputing it — the number the user was shown before pressing
  // start and the number reported after have to be the same one.
  return NextResponse.json({
    jobId: data as string,
    credits: creditsForBlocks(totalBlocks),
  });
}
