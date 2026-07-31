import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { isExpired, type JobOptions } from '../../../lib/jobHistory';

/** Signed URLs are minted per request and expire quickly — the link is for the
 *  click that follows, not something to keep. */
const SIGNED_URL_TTL_SECONDS = 300;

/** Enough to fill the beta's history screen without paging. */
const LIMIT = 50;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('translation_jobs')
    .select(
      'id, source_filename, model, total_blocks, created_at, result_path, options',
    )
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A job with no stored result never finished (or predates storage) — it has
  // nothing to offer, so it does not belong on a "다시 받기" list. Filtered on
  // result_path (the field that actually means "a result exists"), not
  // filename — the two only coincide today because record_job_result happens
  // to write both in the same statement.
  const rows = (data ?? []).filter((row) => row.result_path);

  const now = new Date();
  const expiredById = new Map(
    rows.map((row) => [row.id, isExpired(row.created_at, now)]),
  );

  // Past the promised window we do not hand out a link even if the object is
  // still there — the beta has no cleanup job, so objects outlive the promise
  // and the UI is what keeps it. One batched createSignedUrls call instead of
  // one createSignedUrl per row: same round trip regardless of history size.
  const pathsToSign = rows
    .filter((row) => !expiredById.get(row.id))
    .map((row) => row.result_path as string);

  const signedUrlByPath = new Map<string, string>();
  if (pathsToSign.length > 0) {
    const { data: signed } = await supabase.storage
      .from('results')
      .createSignedUrls(pathsToSign, SIGNED_URL_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (!entry.error && entry.path && entry.signedUrl) {
        signedUrlByPath.set(entry.path, entry.signedUrl);
      }
    }
  }

  const items = rows.map((row) => ({
    jobId: row.id as string,
    filename: (row.source_filename as string | null) ?? '',
    model: (row.model as string | null) ?? null,
    totalBlocks: (row.total_blocks as number) ?? 0,
    createdAt: row.created_at as string,
    options: (row.options as JobOptions | null) ?? null,
    expired: expiredById.get(row.id) ?? true,
    downloadUrl: signedUrlByPath.get(row.result_path as string) ?? null,
  }));

  return NextResponse.json({ items });
}
