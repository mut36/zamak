'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Browser-side Supabase client. Used only to start the OAuth redirect and to
 * sign out; every decision that costs money is made on the server.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
