/**
 * Supabase connection details.
 *
 * Both values are safe in the browser: the anon key only grants what row-level
 * security allows. Credit balances are therefore protected by RLS policies
 * (see supabase/migrations), not by hiding this key.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Whether auth is wired up at all. Kept as an explicit check so a missing
 * config fails with a clear message instead of an opaque Supabase error —
 * without it, every route would 401 and look like a login bug.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
