import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { JOB_VALIDITY_MINUTES } from '../../config/constants';

/**
 * Confirms a chunk request belongs to a job the caller actually paid for.
 *
 * Without this, /api/translate would be free to anyone with a session: the
 * credit is spent when the job opens, so the chunk endpoint is where that
 * payment has to be proven. RLS restricts the row to its owner, so a job id
 * guessed from another account simply does not resolve.
 */
export async function isJobUsable(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<boolean> {
  if (!jobId) return false;

  const cutoff = new Date(
    Date.now() - JOB_VALIDITY_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from('translation_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .maybeSingle();

  return !error && Boolean(data);
}
