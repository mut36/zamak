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

  const now = new Date();
  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const expired = isExpired(row.created_at, now);
      let downloadUrl: string | null = null;

      // Past the promised window we do not hand out a link even if the object
      // is still there — the beta has no cleanup job, so objects outlive the
      // promise and the UI is what keeps it.
      if (!expired && row.result_path) {
        const { data: signed } = await supabase.storage
          .from('results')
          .createSignedUrl(row.result_path, SIGNED_URL_TTL_SECONDS);
        downloadUrl = signed?.signedUrl ?? null;
      }

      return {
        jobId: row.id as string,
        filename: (row.source_filename as string | null) ?? '',
        model: (row.model as string | null) ?? null,
        totalBlocks: (row.total_blocks as number) ?? 0,
        createdAt: row.created_at as string,
        options: (row.options as JobOptions | null) ?? null,
        expired,
        downloadUrl,
      };
    }),
  );

  // A job with no stored result never finished (or predates storage) — it has
  // nothing to offer, so it does not belong on a "다시 받기" list.
  return NextResponse.json({ items: items.filter((i) => i.filename) });
}
