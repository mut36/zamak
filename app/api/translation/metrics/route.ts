import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';

/** Matches translation_jobs.id's `uuid` column shape — same guard the result
 *  route uses, so a malformed id fails with a 400 instead of an opaque 500. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whatever the client sends becomes a number or null. A metric we could not
 *  parse must read as "not measured", never as zero — a run with 0 failed
 *  chunks and a run we failed to measure are opposite facts. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function str(value: unknown, max = 40): string | null {
  return typeof value === 'string' && value ? value.slice(0, max) : null;
}

/**
 * Records what one finished run actually measured.
 *
 * Client-side numbers only — chunk counts, timings, and the leftovers the
 * recovery sweep could not clear. Token usage is NOT here: it comes from the
 * model responses, which only the translate route sees
 * (app/lib/server/chunkUsage.ts).
 *
 * Fire-and-forget from the browser's side, so this route's job is to be
 * harmless: it never fails a run that already succeeded, and it writes through
 * an RPC scoped to auth.uid() rather than trusting a user id in the payload.
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
  if (!UUID_RE.test(jobId)) {
    return NextResponse.json({ error: 'jobId must be a uuid' }, { status: 400 });
  }

  // Normalised rather than passed through: this lands in a jsonb column and
  // whatever a client sends should not decide that column's shape (same rule
  // the result route's `options` follows).
  const rules =
    typeof body.textRules === 'object' && body.textRules !== null
      ? (body.textRules as Record<string, unknown>)
      : {};
  const textRules = {
    ellipsisNormalized: num(rules.ellipsisNormalized) ?? 0,
    linesMerged: num(rules.linesMerged) ?? 0,
    trailingPunctuationStripped: num(rules.trailingPunctuationStripped) ?? 0,
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_job_metrics', {
    p_job_id: jobId,
    p_source_format: str(body.sourceFormat, 8),
    p_target_lang: str(body.targetLang, 16),
    p_total_chunks: num(body.totalChunks),
    p_chunk_size: num(body.chunkSize),
    p_concurrency: num(body.concurrency),
    p_duration_ms: num(body.durationMs),
    p_failed_chunks: num(body.failedChunks),
    p_fallback_blocks: num(body.fallbackBlocks),
    p_recovered_blocks: num(body.recoveredBlocks),
    p_sweep_calls: num(body.sweepCalls),
    p_stop_reason: str(body.stopReason, 24),
    p_glossary_terms: num(body.glossaryTerms),
    p_relation_pairs: num(body.relationPairs),
    p_text_rules: textRules,
  });

  if (error) {
    if (error.message.includes('job not found')) {
      return NextResponse.json({ error: 'job_not_found' }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
