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
 * Return value of a fresh search (enrich()). `candidates` is read directly
 * off the just-awaited response rather than the hook's own `candidates`
 * state, so a caller that wants to act on an ambiguous result (auto-picking
 * the top candidate) never races a stale render-time closure.
 */
export interface EnrichOutcome {
  result: EnrichResult | null;
  candidates: EnrichCandidate[];
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
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<EnrichCandidate[]>([]);

  const post = useCallback(
    async (
      body: unknown,
      // Set by selectCandidate: resolving one candidate from an ambiguous
      // list to 'found' shouldn't wipe the list that produced it — the
      // "이 작품이 아니에요" flow needs the original candidates still sitting
      // in state to show the picker with something other than an empty list.
      opts?: { preserveCandidatesOnFound?: boolean },
    ): Promise<EnrichOutcome> => {
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
        if (data.status === 'found' && data.enrichment) {
          if (!opts?.preserveCandidatesOnFound) setCandidates([]);
          setStatus('found');
          return { result: data.enrichment, candidates: [] };
        }
        if (data.status === 'ambiguous') {
          const found = data.candidates ?? [];
          setCandidates(found);
          setStatus('ambiguous');
          return { result: null, candidates: found };
        }
        setCandidates([]);
        setStatus('notFound');
        return { result: null, candidates: [] };
      } catch (err) {
        setCandidates([]);
        setError(err instanceof Error ? err.message : 'Enrichment failed');
        setStatus('notFound');
        return { result: null, candidates: [] };
      }
    },
    [],
  );

  const enrich = useCallback(
    async (title: string, year: string): Promise<EnrichOutcome> => {
      setError('');
      setCandidates([]);
      if (!title.trim()) {
        setStatus('notFound');
        return { result: null, candidates: [] };
      }
      return post({ title: title.trim(), year: year.trim() });
    },
    [post],
  );

  const selectCandidate = useCallback(
    async (
      candidate: EnrichCandidate,
      title: string,
      year: string,
    ): Promise<EnrichResult | null> => {
      const { result } = await post(
        { candidate, title: title.trim(), year: year.trim() },
        { preserveCandidatesOnFound: true },
      );
      return result;
    },
    [post],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError('');
    setCandidates([]);
  }, []);

  return { status, error, candidates, enrich, selectCandidate, reset };
}
