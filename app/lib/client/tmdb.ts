import type { TmdbLookupResult } from '../server/tmdb';

/**
 * Fetch just the poster URL for a movie/drama from TMDB. The rest of the info
 * card (title, year, director, tone/character notes) comes from the AI
 * analyze/enrich flow — TMDB is used here for the poster image only. Uses the
 * server-side TMDB key (no BYOK), so it never costs the user anything.
 * Returns null on empty title, no match, or any error.
 */
export async function fetchMoviePoster(
  title: string,
  year: string,
): Promise<string | null> {
  if (!title.trim()) return null;
  try {
    const res = await fetch('/api/tmdb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), year: year.trim() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as TmdbLookupResult;
    return data.posterUrl ?? null;
  } catch {
    return null;
  }
}
