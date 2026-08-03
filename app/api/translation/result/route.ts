import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { reportServerError } from '../../../lib/server/reportError';

/** A 2,000-block subtitle file is well under this; the cap only stops a
 *  pathological body from becoming a storage bill. Measured in UTF-16 code
 *  units (JS string length), not bytes — a Korean-heavy file's real UTF-8
 *  size can run ~3x this, so the name says what is actually checked. */
const MAX_CHARS = 4 * 1024 * 1024;

/** Matches translation_jobs.id's `uuid` column shape. Checked before the
 *  value reaches the storage key or the RPC call so a malformed id fails
 *  with a 400 here instead of an opaque 500 from a Postgres cast error. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const maxDuration = 60;

/**
 * Stores a finished translation so the history screen can offer it again.
 *
 * The result only — the uploaded source is never stored. Ownership is checked
 * twice: the storage path is derived from the session (not the request), and
 * record_job_result scopes its update to auth.uid().
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: {
    jobId?: unknown;
    filename?: unknown;
    content?: unknown;
    options?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '');
  const filename = String(body.filename ?? '');
  const content = typeof body.content === 'string' ? body.content : '';
  // Normalised rather than passed through: this lands in a jsonb column, and
  // whatever a client sends should not decide that column's shape.
  const options = {
    glossary:
      typeof body.options === 'object' &&
      body.options !== null &&
      (body.options as { glossary?: unknown }).glossary === true,
  };

  if (!jobId || !filename || !content) {
    return NextResponse.json(
      { error: 'jobId, filename and content are required' },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'jobId must be a uuid' }, { status: 400 });
  }
  if (content.length > MAX_CHARS) {
    return NextResponse.json({ error: 'result_too_large' }, { status: 413 });
  }

  const supabase = await createClient();
  // Path is built from the session, never from the request: this is what makes
  // the storage policy's folder check a real ownership boundary.
  const path = `${auth.user.id}/${jobId}.ko.srt`;

  // Ownership check runs BEFORE the upload, not after: record_job_result
  // scopes its update to auth.uid(), so this is what stops a signed-in user
  // from writing a permanent, unmetered object for a jobId they don't own.
  // The row is the authority — if the upload below fails, the row can briefly
  // point at bytes that never landed, but that is the safer failure direction
  // than orphan bytes with no row pointing at them: the history route already
  // treats a missing object as "no downloadUrl", never an error.
  const { error } = await supabase.rpc('record_job_result', {
    p_job_id: jobId,
    p_filename: filename,
    p_result_path: path,
    p_options: options,
  });

  if (error) {
    if (error.message.includes('job not found')) {
      return NextResponse.json({ error: 'job_not_found' }, { status: 403 });
    }
    await reportServerError({
      userId: auth.user.id,
      route: '/api/translation/result',
      error,
      status: 500,
      detail: { stage: 'record' },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: uploadError } = await supabase.storage
    .from('results')
    .upload(path, new Blob([content], { type: 'text/plain;charset=utf-8' }), {
      upsert: true,
      contentType: 'text/plain;charset=utf-8',
    });

  if (uploadError) {
    // The sharpest one in this table: the credit is already spent and the row
    // already claims a stored result, so a failure here is exactly the orphan
    // the retention TODO warns about — and the user finds out 30 days later.
    await reportServerError({
      userId: auth.user.id,
      route: '/api/translation/result',
      error: uploadError,
      status: 500,
      detail: { stage: 'upload' },
    });
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
