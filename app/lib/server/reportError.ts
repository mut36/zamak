import 'server-only';

import { createClient } from '../supabase/server';

/**
 * Longest exception message we keep. Long enough for a stack's first line or a
 * provider's error body, short enough that nothing can quietly grow into a
 * blob. Truncation happens here rather than in the database so the limit is
 * visible at the call site's side of the wire.
 */
const MAX_MESSAGE = 500;

/** Same rule as beta_events (0009): small flat codes, never free text. */
const MAX_DETAIL_STRING = 64;

interface ReportOptions {
  /** The signed-in caller. Required — see the `user_id` note in 0011. */
  userId: string;
  /** Route path, e.g. '/api/translate'. */
  route: string;
  /** The thrown value. */
  error: unknown;
  /** HTTP status the route is about to return, if it has decided one. */
  status?: number;
  /** Flat codes only: model name, chunk index, format. Never subtitle text. */
  detail?: Record<string, string | number | boolean>;
}

function sanitizeDetail(
  detail: ReportOptions['detail'],
): Record<string, string | number | boolean> {
  if (!detail) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(detail)) {
    if (typeof raw === 'string') out[key] = raw.slice(0, MAX_DETAIL_STRING);
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'boolean') out[key] = raw;
  }
  return out;
}

/**
 * Record a server-side exception so a failure nobody reports still leaves a
 * trace we can count.
 *
 * ## What this is and is not
 *
 * It is not a logger — `console.error` stays exactly where it is at every call
 * site, and Vercel's log remains the place with full stacks. This is the
 * *aggregate*: "how often is /api/translate throwing this week, and is it the
 * same thing every time", a question a log you have to be watching cannot
 * answer. Read it with `supabase/beta-review.sql` §8.
 *
 * ## Privacy
 *
 * Only the exception's own name and message are stored, capped at
 * {@link MAX_MESSAGE}. **Never pass request bodies, prompts, or subtitle lines
 * through `detail`** — the privacy policy's promise that the source's contents
 * are never recorded (0009's header note) covers this table too.
 *
 * ## Never throws
 *
 * Every failure inside is swallowed. A route that is already handling an error
 * must not acquire a second way to fail while reporting the first, and the
 * user's response must not wait on a logging insert that is going nowhere.
 */
export async function reportServerError({
  userId,
  route,
  error,
  status,
  detail,
}: ReportOptions): Promise<void> {
  try {
    const kind =
      error instanceof Error ? error.name || 'Error' : typeof error;
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : String(error);

    const supabase = await createClient();
    await supabase.from('server_errors').insert({
      user_id: userId,
      route,
      kind: kind.slice(0, MAX_DETAIL_STRING),
      message: message.slice(0, MAX_MESSAGE),
      status: status ?? null,
      detail: sanitizeDetail(detail),
    });
  } catch (reportingError) {
    // Deliberately terminal. The original error is already on its way to the
    // caller and into the Vercel log; this line only exists so a silently
    // broken monitor is itself visible.
    console.warn('[monitor] failed to record server error:', reportingError);
  }
}
