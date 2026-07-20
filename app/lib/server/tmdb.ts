import {
  TMDB_API_BASE,
  TMDB_API_KEY,
  TMDB_IMAGE_BASE,
  TMDB_LANGUAGE,
} from '../../config/constants';

/** Thrown when TMDB_API_KEY is missing — a server misconfig, not a "no result". */
export class TmdbNotConfiguredError extends Error {
  constructor() {
    super('TMDB_API_KEY is not configured');
    this.name = 'TmdbNotConfiguredError';
  }
}

export type TmdbMediaType = 'movie' | 'tv';

/** Normalized movie/drama metadata surfaced to the client. */
export interface TmdbLookupResult {
  found: boolean;
  mediaType?: TmdbMediaType;
  tmdbId?: number;
  /** Official (localized) title. */
  title?: string;
  /** 4-digit release/first-air year, or '' when unknown. */
  year?: string;
  /** Director (movie) or first creator (tv), or null. */
  director?: string | null;
  /** Genre names, e.g. ['액션', '스릴러']. */
  genres?: string[];
  /** Synopsis (localized, en fallback), or ''. */
  overview?: string;
  /** Ready-to-use poster URL, or null. */
  posterUrl?: string | null;
}

interface TmdbSearchItem {
  id: number;
  popularity?: number;
  title?: string; // movie
  name?: string; // tv
  release_date?: string; // movie
  first_air_date?: string; // tv
  poster_path?: string | null;
}

interface TmdbCredits {
  crew?: Array<{ job?: string; name?: string }>;
}

interface TmdbDetails {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  genres?: Array<{ name?: string }>;
  created_by?: Array<{ name?: string }>;
  credits?: TmdbCredits;
}

function assertConfigured(): void {
  if (!TMDB_API_KEY) throw new TmdbNotConfiguredError();
}

async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function yearOf(item: { release_date?: string; first_air_date?: string }): string {
  const raw = item.release_date || item.first_air_date || '';
  return /^\d{4}/.test(raw) ? raw.slice(0, 4) : '';
}

/**
 * Search movies + TV in parallel (a "movie·drama" file can be either), then
 * fetch full details (with credits) for the most popular match. Year, when
 * provided, narrows each search. Returns `{ found: false }` when nothing
 * matches — the caller drops into manual input.
 */
export async function lookupTitle(
  title: string,
  year?: string,
): Promise<TmdbLookupResult> {
  assertConfigured();

  const q = title.trim();
  if (!q) return { found: false };
  const y = year?.trim();

  type Candidate = { item: TmdbSearchItem; mediaType: TmdbMediaType };

  const searchCandidates = async (useYear: boolean): Promise<Candidate[]> => {
    const [movieRes, tvRes] = await Promise.all([
      tmdbGet<{ results?: TmdbSearchItem[] }>('/search/movie', {
        query: q,
        language: TMDB_LANGUAGE,
        include_adult: 'false',
        ...(useYear && y ? { year: y } : {}),
      }).catch(() => ({ results: [] as TmdbSearchItem[] })),
      tmdbGet<{ results?: TmdbSearchItem[] }>('/search/tv', {
        query: q,
        language: TMDB_LANGUAGE,
        include_adult: 'false',
        ...(useYear && y ? { first_air_date_year: y } : {}),
      }).catch(() => ({ results: [] as TmdbSearchItem[] })),
    ]);
    return [
      ...(movieRes.results ?? []).map((item) => ({ item, mediaType: 'movie' as const })),
      ...(tvRes.results ?? []).map((item) => ({ item, mediaType: 'tv' as const })),
    ];
  };

  // Year is a filter, not a gate: a title whose year drifts from TMDB's
  // (festival vs wide release, mislabeled files) must still resolve. Search
  // with the year first, then retry without it if nothing comes back.
  let candidates = await searchCandidates(true);
  if (candidates.length === 0 && y) candidates = await searchCandidates(false);

  if (candidates.length === 0) return { found: false };

  // Prefer an exact year match (disambiguates remakes when the year is right),
  // then fall back to popularity.
  candidates.sort((a, b) => {
    if (y) {
      const am = yearOf(a.item) === y ? 1 : 0;
      const bm = yearOf(b.item) === y ? 1 : 0;
      if (am !== bm) return bm - am;
    }
    return (b.item.popularity ?? 0) - (a.item.popularity ?? 0);
  });
  const best = candidates[0];

  const details = await tmdbGet<TmdbDetails>(
    `/${best.mediaType}/${best.item.id}`,
    { language: TMDB_LANGUAGE, append_to_response: 'credits' },
  );

  // Overview is often missing in ko-KR for lesser-known works — fall back to en.
  let overview = (details.overview ?? '').trim();
  if (!overview && TMDB_LANGUAGE !== 'en-US') {
    const en = await tmdbGet<TmdbDetails>(`/${best.mediaType}/${best.item.id}`, {
      language: 'en-US',
    }).catch(() => null);
    overview = (en?.overview ?? '').trim();
  }

  const director =
    best.mediaType === 'movie'
      ? details.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null
      : details.created_by?.[0]?.name ?? null;

  const posterPath = details.poster_path ?? best.item.poster_path ?? null;

  return {
    found: true,
    mediaType: best.mediaType,
    tmdbId: details.id,
    title: (details.title || details.name || '').trim(),
    year: yearOf(details),
    director,
    genres: (details.genres ?? [])
      .map((g) => g.name?.trim())
      .filter((n): n is string => !!n),
    overview,
    posterUrl: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null,
  };
}
