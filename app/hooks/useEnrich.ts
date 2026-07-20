'use client';

import { useCallback, useState } from 'react';

export type EnrichStatus = 'idle' | 'searching' | 'found' | 'notFound';

export interface EnrichResult {
  isMovie: boolean;
  director: string | null;
  year: string | null;
  notes: string;
}

/**
 * Movie/drama enrichment: takes a title (+ year) and web-searches for the
 * work's director and a tone/character translation-context note.
 * If the title is empty or nothing is found, status becomes 'notFound' so the
 * UI can drop into manual-input mode.
 *
 * A request that *fails* also lands on 'notFound' — manual input is the right
 * fallback either way — but it additionally sets `error`. Collapsing the two
 * used to hide real causes behind "자동으로 못 찾았어요": a rejected key, or the
 * googleSearch tool being unavailable on a free-tier Gemini project, both read
 * as "this film isn't on the internet".
 */
export function useEnrich() {
  const [status, setStatus] = useState<EnrichStatus>('idle');
  const [director, setDirector] = useState('');
  const [error, setError] = useState('');

  const enrich = useCallback(
    async (
      title: string,
      year: string,
      apiKey?: string,
    ): Promise<EnrichResult | null> => {
      setError('');
      if (!title.trim()) {
        setDirector('');
        setStatus('notFound');
        return null;
      }
      setStatus('searching');
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'x-gemini-key': apiKey } : {}),
          },
          body: JSON.stringify({ title: title.trim(), year: year.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: unknown;
          } | null;
          throw new Error(
            (typeof body?.error === 'string' && body.error) ||
              `Server error (${res.status})`,
          );
        }
        const data = (await res.json()) as EnrichResult;
        if (data.isMovie && data.notes) {
          setDirector(data.director ?? '');
          setStatus('found');
          return data;
        }
        setDirector('');
        setStatus('notFound');
        return data;
      } catch (err) {
        setDirector('');
        setError(err instanceof Error ? err.message : 'Enrichment failed');
        setStatus('notFound');
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setDirector('');
    setError('');
  }, []);

  return { status, director, error, enrich, reset };
}
