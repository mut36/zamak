import 'server-only';

import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import { isSupabaseConfigured } from '../supabase/env';

/**
 * The result of an auth check: either a user, or the response to return.
 *
 * Modelled as a union so a route cannot accidentally continue past a failed
 * check — there is no user to read unless the check passed.
 */
export type AuthOutcome =
  | { ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * Every route that spends the server key calls this first.
 *
 * The gate lives here rather than in the proxy because the proxy runs before
 * routing and can be sidestepped; this is the check that actually stands
 * between an anonymous request and our Gemini bill.
 */
export async function requireUser(): Promise<AuthOutcome> {
  if (!isSupabaseConfigured) {
    // Fail closed. A missing config must never silently open the routes back
    // up — that is exactly the hole this gate exists to close.
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Authentication is not configured on this server.' },
        { status: 500 },
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '로그인이 필요해요.' },
        { status: 401 },
      ),
    };
  }

  return { ok: true, user };
}
