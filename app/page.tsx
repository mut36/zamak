import { WizardApp } from './components/beta/WizardApp';
import { LandingPage } from './components/simple/LandingPage';
import { isSupabaseConfigured } from './lib/supabase/env';
import { createClient } from './lib/supabase/server';

/**
 * `/` is two pages wearing one URL: the marketing landing for strangers, the
 * translation wizard for members. **Which one is decided here, on the server.**
 *
 * It used to be decided in the browser: this file was `'use client'`, read the
 * session through `useAuth`, and returned a bare `<div className='min-h-screen'>`
 * while `loading` was true. `loading` starts true on every render including the
 * server's, so the HTML we actually shipped to a crawler was that empty div —
 * the whole landing page (LandingPage.tsx, ~740 lines of the only marketing
 * copy we have) existed solely in a client render nobody indexing us ever ran.
 * Measured 2026-08-19: the served document's entire visible text was the
 * `<title>`. Note that `'use client'` was never the problem — Next renders
 * client components to HTML too; the blank early return was.
 *
 * Reading cookies makes this route dynamic. That is the price and it is the
 * right one: the landing has no per-visitor content, but a wrong-half flash is
 * worse than a cache miss, and being indexable at all outranks both.
 *
 * ⚠️ Keep the two halves behind a real server-side session check. Any early
 * return added above this one lands in the crawler's document — `app/seo.test.ts`
 * pins the landing's hero copy for exactly that reason.
 */
export default async function Home() {
  // Nothing to check when auth was never configured — the landing renders its
  // own "not configured" notice and every CTA is disabled.
  if (!isSupabaseConfigured) return <LandingPage />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <WizardApp /> : <LandingPage />;
}
