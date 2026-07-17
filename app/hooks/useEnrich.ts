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
 */
export function useEnrich() {
  const [status, setStatus] = useState<EnrichStatus>('idle');
  const [director, setDirector] = useState('');

  const enrich = useCallback(
    async (title: string, year: string): Promise<EnrichResult | null> => {
      if (!title.trim()) {
        setDirector('');
        setStatus('notFound');
        return null;
      }
      setStatus('searching');
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), year: year.trim() }),
        });
        if (!res.ok) throw new Error('enrich failed');
        const data = (await res.json()) as EnrichResult;
        if (data.isMovie && data.notes) {
          setDirector(data.director ?? '');
          setStatus('found');
          return data;
        }
        setDirector('');
        setStatus('notFound');
        return data;
      } catch {
        setDirector('');
        setStatus('notFound');
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setDirector('');
  }, []);

  return { status, director, enrich, reset };
}
