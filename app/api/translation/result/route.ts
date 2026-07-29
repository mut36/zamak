import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';

/** A 2,000-block subtitle file is well under this; the cap only stops a
 *  pathological body from becoming a storage bill. */
const MAX_BYTES = 4 * 1024 * 1024;

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
  if (content.length > MAX_BYTES) {
    return NextResponse.json({ error: 'result_too_large' }, { status: 413 });
  }

  const supabase = await createClient();
  // Path is built from the session, never from the request: this is what makes
  // the storage policy's folder check a real ownership boundary.
  const path = `${auth.user.id}/${jobId}.ko.srt`;

  const { error: uploadError } = await supabase.storage
    .from('results')
    .upload(path, new Blob([content], { type: 'text/plain;charset=utf-8' }), {
      upsert: true,
      contentType: 'text/plain;charset=utf-8',
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
