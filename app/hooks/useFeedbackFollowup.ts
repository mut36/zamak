'use client';

import { useEffect, useState } from 'react';
import {
  fetchPendingFeedback,
  type PendingFeedbackItem,
} from '../lib/client/feedback';

/**
 * Looks up the one finished job worth asking about on this visit, once per
 * app entry — same stale-guard shape as useWizard's consent fetch (both are
 * "ask the server once, on sign-in, whether there's something to show").
 *
 * `clear()` drops the item after it's answered or dismissed so the same
 * follow-up doesn't reappear later in the same session (the server records
 * the real dismissal; this just avoids a stale re-render).
 */
export function useFeedbackFollowup(signedIn: boolean) {
  const [item, setItem] = useState<PendingFeedbackItem | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let stale = false;
    fetchPendingFeedback().then((result) => {
      if (!stale) setItem(result);
    });
    return () => {
      stale = true;
    };
  }, [signedIn]);

  const clear = () => setItem(null);

  return { item, clear };
}
