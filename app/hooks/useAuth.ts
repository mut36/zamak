'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '../lib/supabase/client';
import { isSupabaseConfigured } from '../lib/supabase/env';

export interface AccountState {
  /** null once loading finishes and nobody is signed in. */
  user: User | null;
  /** Credits left. null until the balance has been fetched. */
  balance: number | null;
  loading: boolean;
}

/**
 * Session + credit balance for the UI.
 *
 * The balance is advisory here — it decides what the screen offers, never
 * whether work happens. The server spends the credit and is the only thing
 * that can refuse.
 */
export function useAuth() {
  const [state, setState] = useState<AccountState>({
    user: null,
    balance: null,
    // With no Supabase config there is nothing to load — start settled so the
    // gate renders its "not configured" message immediately.
    loading: isSupabaseConfigured,
  });

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits');
      if (!res.ok) return;
      const data = (await res.json()) as { balance?: number };
      setState((prev) => ({ ...prev, balance: data.balance ?? 0 }));
    } catch {
      /* leave the previous balance in place */
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setState({ user: data.user ?? null, balance: null, loading: false });
      if (data.user) refreshBalance();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        user: session?.user ?? null,
        balance: null,
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
    setState({ user: null, balance: null, loading: false });
  }, []);

  return { ...state, signIn, signOut, refreshBalance };
}
