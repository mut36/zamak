import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Supabase client bound to the request's cookies, for use in route handlers
 * and server components.
 *
 * Writing cookies throws in a server component (only middleware and route
 * handlers may set them). That is expected and ignored here: the middleware
 * refreshes the session on every request, so a read-only render still sees a
 * valid one.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* server component render — middleware handles the refresh */
        }
      },
    },
  });
}
