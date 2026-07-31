import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';

/** Same TTL the history route uses — the link is for the panel about to open,
 *  not something to keep. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * The one finished translation worth asking about on this visit, if any.
 *
 * "Did you actually use it?" cannot be answered on the completion screen —
 * at that moment the file has not been opened yet. So it is asked later, and
 * `pending_feedback_job()` owns the definition of later (see
 * 0009_beta_metrics.sql): finished at least 6 hours ago, still inside the
 * 30-day retention window, not yet answered, not dismissed.
 *
 * The stored result is signed and handed over with it, because a question
 * about a file the user translated days ago is only answerable next to the
 * lines themselves.
 */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pending_feedback_job');

  if (error) {
    // Never an error the user sees: this runs on app entry, and a broken
    // survey must not look like a broken app.
    console.warn('[feedback] pending lookup failed:', error.message);
    return NextResponse.json({ item: null });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ item: null });

  // The RPC returns only what it selects; the path lives on the job row and is
  // read here under the caller's own RLS.
  const { data: job } = await supabase
    .from('translation_jobs')
    .select('result_path')
    .eq('id', row.job_id)
    .single();

  let resultUrl: string | null = null;
  if (job?.result_path) {
    const { data: signed } = await supabase.storage
      .from('results')
      .createSignedUrl(job.result_path as string, SIGNED_URL_TTL_SECONDS);
    resultUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    item: {
      jobId: row.job_id as string,
      filename: (row.source_filename as string | null) ?? '',
      model: (row.model as string | null) ?? null,
      completedAt: row.completed_at as string,
      resultUrl,
    },
  });
}
