'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CastSheet } from '../types/glossary';
import { EMPTY_CAST_SHEET } from '../types/glossary';
import type { MovieInfo } from '../types/translation';
import { GLOSSARY_WAIT_MS } from '../config/constants';

export type CastSheetStatus = 'idle' | 'extracting' | 'ready' | 'error';

const STORAGE_KEY = 'zamak.castSheet.enabled';

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

type CastSheetMovieInfo = Pick<
  MovieInfo,
  'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'
>;

/**
 * Cast-sheet toggle + extraction lifecycle for InfoStep. Independent of the
 * translation model choice — a plain on/off, remembered per browser so a
 * user who turns it on once gets it automatically from then on (see
 * docs/decisions.md on the toggle default).
 *
 * Extraction is fire-once-per-file: `request` is a no-op while one is
 * already in flight or done for the current file (guarded by a ref, not
 * React state, so effect double-invocation in dev can't double-dispatch).
 * Turning the toggle off aborts an in-flight call and rewinds it to 'idle'
 * so turning back on retries — but a call that already finished ('ready')
 * is left alone, so re-enabling never re-fetches for the same file.
 */
export function useCastSheet() {
  // Lazy initializer: reads localStorage once, on first mount. A hydration
  // mismatch would need this value in rendered markup at mount time, but the
  // component that shows it (InfoStep, step 1) never mounts on first paint —
  // the wizard always starts at step 0 — so server and client agreeing on a
  // placeholder `false` here is never actually observed.
  const [enabled, setEnabledState] = useState(readStoredEnabled);
  const [status, setStatus] = useState<CastSheetStatus>('idle');
  const [sheet, setSheet] = useState<CastSheet>(EMPTY_CAST_SHEET);

  const abortRef = useRef<AbortController | null>(null);
  const dispatchedRef = useRef(false);
  const pendingRef = useRef<Promise<CastSheet> | null>(null);
  const sheetRef = useRef(sheet);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
      }
      if (!value && status === 'extracting') {
        abortRef.current?.abort();
        dispatchedRef.current = false;
        pendingRef.current = null;
        setStatus('idle');
      }
    },
    [status],
  );

  const request = useCallback(
    (content: string, movieInfo: CastSheetMovieInfo): Promise<CastSheet> => {
      if (!content) return Promise.resolve(EMPTY_CAST_SHEET);
      if (dispatchedRef.current && pendingRef.current) return pendingRef.current;

      dispatchedRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('extracting');

      const promise = (async (): Promise<CastSheet> => {
        try {
          const res = await fetch('/api/glossary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, movieInfo }),
            signal: controller.signal,
          });
          const data: CastSheet = res.ok ? await res.json() : EMPTY_CAST_SHEET;
          setSheet(data);
          setStatus('ready');
          return data;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return EMPTY_CAST_SHEET;
          }
          setSheet(EMPTY_CAST_SHEET);
          setStatus('error');
          return EMPTY_CAST_SHEET;
        }
      })();

      pendingRef.current = promise;
      return promise;
    },
    [],
  );

  /** Force a fresh extraction even if one already completed ("다시 추출"). */
  const refetch = useCallback(
    (content: string, movieInfo: CastSheetMovieInfo) => {
      abortRef.current?.abort();
      dispatchedRef.current = false;
      pendingRef.current = null;
      setStatus('idle');
      return request(content, movieInfo);
    },
    [request],
  );

  /**
   * Wait up to timeoutMs for an in-flight extraction, then proceed with
   * whatever's available — this must never block translation indefinitely.
   *
   * Always resolves with `sheetRef.current` (the latest state), never with
   * `pendingRef.current`'s own resolved value directly: once extraction
   * finishes, that promise is frozen at the just-fetched data forever, so
   * racing it after the user has since hand-edited the sheet in
   * CastSheetCard would silently ship the pre-edit version instead of their
   * correction. Only race against the *pending* promise while genuinely
   * extracting (status 'extracting'); once settled, there's nothing to wait
   * for and the latest sheet is returned immediately.
   */
  const awaitReady = useCallback(
    (timeoutMs: number = GLOSSARY_WAIT_MS): Promise<CastSheet> => {
      if (status !== 'extracting' || !pendingRef.current) {
        return Promise.resolve(sheetRef.current);
      }
      return new Promise<CastSheet>((resolve) => {
        const timer = setTimeout(() => resolve(sheetRef.current), timeoutMs);
        // Resolve with the promise's own value, not sheetRef — the effect
        // that syncs sheetRef from React state hasn't necessarily flushed
        // yet at the instant this settles. Moot for edits either way: the
        // edit UI only renders once status leaves 'extracting' (see
        // CastSheetCard's `hasResult`), so nothing can have edited the sheet
        // while this branch is waiting.
        pendingRef.current!.then((data) => {
          clearTimeout(timer);
          resolve(data);
        });
      });
    },
    [status],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatchedRef.current = false;
    pendingRef.current = null;
    setSheet(EMPTY_CAST_SHEET);
    setStatus('idle');
  }, []);

  return {
    enabled,
    setEnabled,
    status,
    sheet,
    setSheet,
    request,
    refetch,
    awaitReady,
    reset,
  };
}
