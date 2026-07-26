'use client';

import { useCallback, useState } from 'react';

export type EnrichStatus = 'idle' | 'searching' | 'found' | 'ambiguous' | 'notFound';

/**
 * Unified enrichment result — mirrors MovieEnrichment (lib/server/enrichMovie).
 * title/year/director/posterUrl are UI-facing; genre/era/tone are AI-facing
 * keyword fields fed into the translation prompt, never rendered.
 */
export interface EnrichResult {
  found: boolean;
  title: string;
  year: string;
  director: string | null;
  posterUrl: string | null;
  genre: string;
  era: string;
  tone: string;
}

/** A TMDB search hit — mirrors TmdbCandidate (lib/server/tmdb). */
export interface EnrichCandidate {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  year: string;
  overview: string;
  posterUrl: string | null;
}

interface EnrichApiResponse {
  status: 'found' | 'ambiguous' | 'not_found';
  enrichment?: EnrichResult;
  candidates?: EnrichCandidate[];
}

/**
 * Movie/drama enrichment: takes a title (+ year) and resolves it via TMDB
 * first, falling back to a Google-grounded search for whatever TMDB has no
 * record of (see searchMovie() server-side).
 * If the title is empty or nothing is found, status becomes 'notFound' so the
 * UI can drop into manual-input mode. If TMDB has several equally-plausible
 * matches (a common title, a remake), status becomes 'ambiguous' and
 * `candidates` holds the options — call selectCandidate() with the user's
 * pick to resolve it, instead of silently guessing on every re-search.
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
  const [candidates, setCandidates] = useState<EnrichCandidate[]>([]);

  const applyResponse = useCallback(
    (data: EnrichApiResponse): EnrichResult | null => {
      if (data.status === 'found' && data.enrichment) {
        setDirector(data.enrichment.director ?? '');
        setCandidates([]);
        setStatus('found');
        return data.enrichment;
      }
      if (data.status === 'ambiguous') {
        setDirector('');
        setCandidates(data.candidates ?? []);
        setStatus('ambiguous');
        return null;
      }
      setDirector('');
      setCandidates([]);
      setStatus('notFound');
      return null;
    },
    [],
  );

  const post = useCallback(
    async (body: unknown): Promise<EnrichResult | null> => {
      setError('');
      setStatus('searching');
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as {
            error?: unknown;
          } | null;
          throw new Error(
            (typeof errBody?.error === 'string' && errBody.error) ||
              `Server error (${res.status})`,
          );
        }
        const data = (await res.json()) as EnrichApiResponse;
        return applyResponse(data);
      } catch (err) {
        setDirector('');
        setCandidates([]);
        setError(err instanceof Error ? err.message : 'Enrichment failed');
        setStatus('notFound');
        return null;
      }
    },
    [applyResponse],
  );

  const enrich = useCallback(
    async (title: string, year: string): Promise<EnrichResult | null> => {
      setError('');
      setCandidates([]);
      if (!title.trim()) {
        setDirector('');
        setStatus('notFound');
        return null;
      }
      return post({ title: title.trim(), year: year.trim() });
    },
    [post],
  );

  const selectCandidate = useCallback(
    (candidate: EnrichCandidate, title: string, year: string) =>
      post({ candidate, title: title.trim(), year: year.trim() }),
    [post],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setDirector('');
    setError('');
    setCandidates([]);
  }, []);

  return { status, director, error, candidates, enrich, selectCandidate, reset };
}
