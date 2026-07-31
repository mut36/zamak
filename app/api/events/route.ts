import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';
import { BETA_EVENTS, type BetaEvent } from '../../config/constants';

/** Longest value any detail field is allowed to be — funnel detail is small,
 *  flat codes (a reason, a format, an extension), never free text. */
const MAX_DETAIL_STRING = 32;

/** Detail values must be primitives whatever the client sends: this lands in
 *  a jsonb column, and the client's shape should never decide that column's
 *  contents (same rule the metrics route's textRules follows). Nesting or
 *  long strings are dropped rather than stored — a beta_events row is a
 *  funnel step, not free-form telemetry, and no path here can carry subtitle
 *  text (see 0009_beta_metrics.sql's header note). */
function sanitizeDetail(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string') {
      out[key] = raw.slice(0, MAX_DETAIL_STRING);
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
      out[key] = raw;
    } else if (typeof raw === 'boolean') {
      out[key] = raw;
    }
  }
  return out;
}

/**
 * Records one funnel step that leaves no other trace — an upload rejection,
 * a confirmed setting, a download click, the exhausted screen showing up.
 * Everything derivable from translation_jobs is deliberately not sent here.
 *
 * Fire-and-forget from the browser (see app/lib/client/events.ts): this
 * route's job is to be harmless, never to fail a screen that already
 * rendered. Direct insert (not an RPC) into beta_events, whose RLS policy
 * already scopes writes to auth.uid() = user_id — same shape as the
 * feedback route's upsert.
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

  const event = typeof body.event === 'string' ? body.event : '';
  if (!BETA_EVENTS.includes(event as BetaEvent)) {
    return NextResponse.json({ error: 'unknown event' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from('beta_events').insert({
    user_id: auth.user.id,
    event,
    detail: sanitizeDetail(body.detail),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
