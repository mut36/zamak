import 'server-only';

import { NextResponse } from 'next/server';
import { createClient } from '../supabase/server';
import { RATE_LIMITS, type RateLimitBucket } from '../../config/constants';
import { COPY } from '../../i18n/simpleCopy';

/**
 * Same union shape as `AuthOutcome` (auth.ts), for the same reason: a route
 * cannot accidentally continue past a check it failed, because the passing
 * branch is the only one that carries no response to return.
 */
export type RateLimitOutcome =
  | { ok: true }
  | { ok: false; response: NextResponse };

interface ConsumeResult {
  allowed: boolean;
  retry_after: number;
}

function isConsumeResult(value: unknown): value is ConsumeResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.allowed === 'boolean' && typeof v.retry_after === 'number';
}

/**
 * Spend one call from the signed-in user's budget for `bucket`.
 *
 * Call this **after** `requireUser()` — the counter is keyed by `auth.uid()`
 * inside the RPC, so an anonymous request has nothing to spend and the RPC
 * would raise rather than return a verdict.
 *
 * ## Why this fails OPEN
 *
 * A database hiccup here returns `{ ok: true }` and logs. That is deliberate
 * and it is the opposite of `requireUser()`, which fails closed — the two
 * guards are protecting different things. `requireUser()` is the wall between
 * an anonymous internet and our Gemini bill, so a broken wall must mean "no
 * one passes". This is a ceiling on how fast an *already authenticated* user
 * may call, and the worst case it prevents is one person's script running up a
 * bill we can see and cap. Trading "every upload in the beta breaks whenever
 * Supabase blips" for that would be a bad trade.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
): Promise<RateLimitOutcome> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error || !isConsumeResult(data)) {
      console.warn(
        `[rate-limit] check skipped for "${bucket}":`,
        error?.message ?? 'unexpected RPC payload',
      );
      return { ok: true };
    }

    if (data.allowed) return { ok: true };

    return {
      ok: false,
      response: NextResponse.json(
        { error: COPY.error.rateLimited(data.retry_after) },
        { status: 429, headers: { 'Retry-After': String(data.retry_after) } },
      ),
    };
  } catch (err) {
    console.warn(`[rate-limit] check skipped for "${bucket}":`, err);
    return { ok: true };
  }
}
