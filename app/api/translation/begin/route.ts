import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { MAX_BLOCKS_PER_CREDIT } from '../../../config/constants';

/**
 * Opens a translation job, spending one credit.
 *
 * This is the only place a credit is consumed. Charging here rather than in
 * /api/translate is what makes "one credit = one file" true: a film is
 * translated as a dozen parallel chunk requests, and charging per request
 * would empty an account on a single movie.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { totalBlocks?: unknown };
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

  if (totalBlocks > MAX_BLOCKS_PER_CREDIT) {
    return NextResponse.json(
      {
        error: 'file_too_large',
        maxBlocks: MAX_BLOCKS_PER_CREDIT,
        totalBlocks,
      },
      { status: 413 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('begin_translation_job', {
    p_total_blocks: totalBlocks,
  });

  if (error) {
    // The function raises this when the balance is already zero. It is an
    // expected outcome, not a fault, so it gets its own status and code.
    if (error.message.includes('insufficient credits')) {
      return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobId: data as string });
}
