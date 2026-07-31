'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../lib/supabase/client';
import { isSupabaseConfigured } from '../lib/supabase/env';
import type { CreditBalances } from '../lib/creditKind';

export interface AccountState {
  /** null once loading finishes and nobody is signed in. */
  user: User | null;
  /** Credit balances. null until they have been fetched. */
  credits: CreditBalances | null;
  /** The signed-in user's email, or null. Used to prefill the waitlist form. */
  email: string | null;
  loading: boolean;
}

/**
 * Session + credit balances for the UI.
 *
 * The balances are advisory here — they decide what the screen offers, never
 * whether work happens. The server spends the credit and is the only thing
 * that can refuse.
 */
export function useAuth() {
  const [state, setState] = useState<AccountState>({
    user: null,
    credits: null,
    email: null,
    // With no Supabase config there is nothing to load — start settled so the
    // gate renders its "not configured" message immediately.
    loading: isSupabaseConfigured,
  });

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits');
      if (!res.ok) return;
      const data = (await res.json()) as {
        credits?: CreditBalances;
        email?: string | null;
      };
      setState((prev) => ({
        ...prev,
        credits: data.credits ?? { lite: 0, pro: 0 },
        email: data.email ?? null,
      }));
    } catch {
      /* leave the previous balances in place */
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState({ user: data.user ?? null, credits: null, email: null, loading: false });
      if (data.user) refreshBalance();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        user: session?.user ?? null,
        credits: null,
        email: null,
        loading: false,
      });
      if (session?.user) refreshBalance();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshBalance]);

  const signIn = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setState({ user: null, credits: null, email: null, loading: false });
  }, []);

  return { ...state, signIn, signOut, refreshBalance };
}
