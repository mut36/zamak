'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CastSheet } from '../types/glossary';
import { EMPTY_CAST_SHEET } from '../types/glossary';
import type { MovieInfo } from '../types/translation';
import { GLOSSARY_WAIT_MS } from '../config/constants';

export type CastSheetStatus = 'idle' | 'extracting' | 'ready' | 'error';

type CastSheetMovieInfo = Pick<
  MovieInfo,
  'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'
>;

/**
 * Cast-sheet extraction lifecycle. **켜고 끄는 주체는 모델이지 사용자가
 * 아니다** — 호출자가 `glossaryAppliesTo(model)`을 넘긴다(2026-08-21).
 *
 * 예전에는 브라우저별로 저장되는 opt-in 토글이었다. 저장값을 남겨두지 않고
 * 통째로 지운 이유: 이제 이 기능의 on/off는 계정이 무엇을 샀는지(프로냐
 * 라이트냐)로 정해지므로, 브라우저에 남은 옛 선택은 어떤 경우에도 정답이
 * 아니다. §6-7이 저장값을 남긴 것은 그때는 그게 사용자의 선택이었기 때문이다.
 *
 * Extraction is fire-once-per-file: `request` is a no-op while one is
 * already in flight or done for the current file (guarded by a ref, not
 * React state, so effect double-invocation in dev can't double-dispatch).
 * `active`가 false로 떨어지면 진행 중인 호출을 끊고 'idle'로 되감아, 다시
 * 프로로 돌아왔을 때 재시도가 가능하게 한다 — 이미 끝난 호출('ready')은
 * 건드리지 않으므로 같은 파일을 두 번 뽑는 일은 없다.
 */
export function useCastSheet(active: boolean) {
  const [status, setStatus] = useState<CastSheetStatus>('idle');
  const [sheet, setSheet] = useState<CastSheet>(EMPTY_CAST_SHEET);

  const abortRef = useRef<AbortController | null>(null);
  const dispatchedRef = useRef(false);
  const pendingRef = useRef<Promise<CastSheet> | null>(null);
  const sheetRef = useRef(sheet);
  // status를 effect의 의존성에 넣으면 abort가 status를 바꾸고 그게 다시 effect를
  // 도는 고리가 된다. sheetRef와 같은 이유로 ref에서 읽는다.
  const statusRef = useRef(status);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // 프로 → 라이트로 바꾸면 진행 중인 추출은 의미가 없다. 끊고 되감아 두면
  // 다시 프로로 돌아왔을 때 트리거 effect가 새로 요청한다.
  useEffect(() => {
    if (active) return;
    if (statusRef.current !== 'extracting') return;
    abortRef.current?.abort();
    dispatchedRef.current = false;
    pendingRef.current = null;
    // 외부 시스템(AbortController)을 끊은 뒤 그 사실을 상태에 반영하는 것이라
    // 렌더 연쇄가 아니다 — active가 바뀌는 순간에만, 그것도 진행 중일 때만 돈다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('idle');
  }, [active]);

  const request = useCallback(
    (
      content: string,
      movieInfo: CastSheetMovieInfo,
      targetLang: string,
      model: string,
    ): Promise<CastSheet> => {
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
            // model은 서버가 게이트를 다시 거는 데 쓴다 — 과금 없는 호출 중
            // 가장 비싼 것이라 라이트 요청이 새면 안 된다.
            body: JSON.stringify({ content, movieInfo, targetLang, model }),
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
    (
      content: string,
      movieInfo: CastSheetMovieInfo,
      targetLang: string,
      model: string,
    ) => {
      abortRef.current?.abort();
      dispatchedRef.current = false;
      pendingRef.current = null;
      setStatus('idle');
      return request(content, movieInfo, targetLang, model);
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
    enabled: active,
    status,
    sheet,
    setSheet,
    request,
    refetch,
    awaitReady,
    reset,
  };
}
