'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MovieInfo } from '../types/translation';
import { GLOSSARY_WAIT_MS } from '../config/constants';

export type DirectorNoteStatus = 'idle' | 'extracting' | 'ready' | 'error';

type NoteMovieInfo = Pick<
  MovieInfo,
  'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'
>;

/**
 * 연출 메모 프리패스의 생명주기. `useCastSheet`과 같은 자리를 대신하므로 같은
 * 뼈대다 — 파일당 한 번만 발사(ref 가드), `active`가 꺼지면 진행 중 요청을
 * 끊고 'idle'로 되감기, 번역 직전에 유예 시간만큼만 기다리기.
 *
 * **다른 점이 하나 있고, 그게 이 훅의 존재 이유다**: 결과가 이 훅 안에 머물지
 * 않고 `movieInfo.notes`(사용자가 편집하는 상태)로 나간다. 그래서
 * 이 훅은 값을 보관하지 않고, 대신 `onNote` 콜백으로 한 번 밀어 넣는다.
 * 번역에 실리는 값은 언제나 `movieInfo.notes` — 즉 **사용자가 마지막으로 본
 * 그 문자열**이다. `useCastSheet.awaitReady`가 "편집본이 조용히 덮이는" 사고를
 * 막으려고 공들여야 했던 문제가, 값을 안 들고 있으면 아예 생기지 않는다.
 */
export function useDirectorNote(active: boolean) {
  const [status, setStatus] = useState<DirectorNoteStatus>('idle');

  const abortRef = useRef<AbortController | null>(null);
  const dispatchedRef = useRef(false);
  const pendingRef = useRef<Promise<void> | null>(null);
  const statusRef = useRef(status);

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
      movieInfo: NoteMovieInfo,
      targetLang: string,
      model: string,
      onNote: (note: string) => void,
    ): Promise<void> => {
      if (!content) return Promise.resolve();
      if (dispatchedRef.current && pendingRef.current) return pendingRef.current;

      dispatchedRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('extracting');

      const promise = (async (): Promise<void> => {
        try {
          const res = await fetch('/api/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // model은 서버가 게이트를 다시 거는 데 쓴다 — 과금 없는 호출 중
            // 가장 비싼 것이라 라이트 요청이 새면 안 된다.
            body: JSON.stringify({ content, movieInfo, targetLang, model }),
            signal: controller.signal,
          });
          const data: { note?: string } = res.ok ? await res.json() : {};
          const note = typeof data.note === 'string' ? data.note.trim() : '';
          if (note) onNote(note);
          setStatus('ready');
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          setStatus('error');
        }
      })();

      pendingRef.current = promise;
      return promise;
    },
    [],
  );

  /** 사용자가 "다시 쓰기"를 눌렀을 때 — 완료된 추출도 새로 돌린다. */
  const refetch = useCallback(
    (
      content: string,
      movieInfo: NoteMovieInfo,
      targetLang: string,
      model: string,
      onNote: (note: string) => void,
    ) => {
      abortRef.current?.abort();
      dispatchedRef.current = false;
      pendingRef.current = null;
      setStatus('idle');
      return request(content, movieInfo, targetLang, model, onNote);
    },
    [request],
  );

  /**
   * 진행 중인 추출에 유예 시간만큼만 자리를 내준다. 번역을 무한정 막지 않는
   * 것이 이 함수의 유일한 계약이다 — 값을 돌려주지 않는 이유는 위 주석대로,
   * 실릴 값이 이미 `movieInfo.notes`에 있기 때문이다.
   */
  const awaitSettled = useCallback(
    (timeoutMs: number = GLOSSARY_WAIT_MS): Promise<void> => {
      if (status !== 'extracting' || !pendingRef.current) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        pendingRef.current!.then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    [status],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatchedRef.current = false;
    pendingRef.current = null;
    setStatus('idle');
  }, []);

  return { enabled: active, status, request, refetch, awaitSettled, reset };
}
