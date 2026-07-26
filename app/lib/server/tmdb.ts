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
  /** Top-billed cast (character + actor), most prominent first. */
  cast?: TmdbCastMember[];
}

interface TmdbSearchItem {
  id: number;
  popularity?: number;
  title?: string; // movie
  name?: string; // tv
  release_date?: string; // movie
  first_air_date?: string; // tv
  poster_path?: string | null;
  overview?: string;
}

/**
 * Lightweight search hit — no detail/credits fetch behind it. Used to let the
 * user disambiguate among several matches before we spend a detail call (and
 * a grounded era/tone call) on the wrong one.
 */
export interface TmdbCandidate {
  mediaType: TmdbMediaType;
  tmdbId: number;
  title: string;
  year: string;
  overview: string;
  posterUrl: string | null;
}

interface TmdbCredits {
  crew?: Array<{ job?: string; name?: string }>;
  cast?: Array<{ character?: string; name?: string; order?: number }>;
}

/** A cast member as billed — character name (often untranslated) + actor. */
export interface TmdbCastMember {
  character: string;
  actor: string;
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

type RawCandidate = { item: TmdbSearchItem; mediaType: TmdbMediaType };

/**
 * Search movies + TV in parallel (a "movie·drama" file can be either). Year,
 * when provided, narrows each search but is a filter, not a gate: a title
 * whose year drifts from TMDB's (festival vs wide release, mislabeled files)
 * must still resolve, so a year-narrowed miss retries without the year.
 * Returns candidates sorted best-first (exact year match, then popularity),
 * uncapped — callers decide how many to use.
 */
async function searchRaw(q: string, y: string | undefined): Promise<RawCandidate[]> {
  const search = async (useYear: boolean): Promise<RawCandidate[]> => {
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

  let candidates = await search(true);
  if (candidates.length === 0 && y) candidates = await search(false);

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
  return candidates;
}

/**
 * Lightweight search: no detail/credits fetch. Returns every match, best-first
 * — uncapped, since it's the caller's job to decide what "one match" vs
 * "several matches" means (and how many to show).
 */
export async function searchCandidates(
  title: string,
  year?: string,
): Promise<TmdbCandidate[]> {
  assertConfigured();

  const q = title.trim();
  if (!q) return [];

  const raw = await searchRaw(q, year?.trim());
  return raw.map(({ item, mediaType }) => ({
    mediaType,
    tmdbId: item.id,
    title: (item.title || item.name || '').trim(),
    year: yearOf(item),
    overview: (item.overview ?? '').trim(),
    posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null,
  }));
}

/** Full details (with credits) for a specific, already-identified work. */
export async function lookupById(
  mediaType: TmdbMediaType,
  tmdbId: number,
): Promise<TmdbLookupResult> {
  assertConfigured();

  const details = await tmdbGet<TmdbDetails>(`/${mediaType}/${tmdbId}`, {
    language: TMDB_LANGUAGE,
    append_to_response: 'credits',
  });

  // Overview is often missing in ko-KR for lesser-known works — fall back to en.
  let overview = (details.overview ?? '').trim();
  if (!overview && TMDB_LANGUAGE !== 'en-US') {
    const en = await tmdbGet<TmdbDetails>(`/${mediaType}/${tmdbId}`, {
      language: 'en-US',
    }).catch(() => null);
    overview = (en?.overview ?? '').trim();
  }

  const director =
    mediaType === 'movie'
      ? details.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null
      : details.created_by?.[0]?.name ?? null;

  // Top-billed cast, most prominent first — the anchor for cast-sheet
  // extraction's name-spelling glossary (extractCastSheet.ts). TMDB rarely
  // localizes `character` into Korean, so this is mostly a "here's the
  // actor" hint rather than a ready Korean name; the model still has to do
  // the actual romanization work for most entries.
  const cast = (details.credits?.cast ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => ({
      character: (c.character ?? '').trim(),
      actor: (c.name ?? '').trim(),
    }))
    .filter((c) => c.character && c.actor);

  return {
    found: true,
    mediaType,
    tmdbId: details.id,
    title: (details.title || details.name || '').trim(),
    year: yearOf(details),
    director,
    genres: (details.genres ?? [])
      .map((g) => g.name?.trim())
      .filter((n): n is string => !!n),
    overview,
    posterUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
    cast,
  };
}
