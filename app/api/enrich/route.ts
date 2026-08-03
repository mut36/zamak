import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enforceRateLimit } from '../../lib/server/rateLimit';
import { reportServerError } from '../../lib/server/reportError';
import {
  enrichMovieById,
  searchMovie,
  type TmdbCandidate,
} from '../../lib/server/enrichMovie';

export const maxDuration = 30;

function isValidCandidate(value: unknown): value is TmdbCandidate {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    (c.mediaType === 'movie' || c.mediaType === 'tv') &&
    typeof c.tmdbId === 'number'
  );
}

export async function POST(request: NextRequest) {
  // Signed-in only; no credit charged (see /api/analyze).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // The costliest of the three uncharged routes — a TMDB lookup plus a
  // grounded search call (enrichMovie.ts `extractKeywords`). Shares the `aux`
  // budget with /api/analyze and /api/summarize.
  const limited = await enforceRateLimit('aux');
  if (!limited.ok) return limited.response;

  let body: { title?: string; year?: string; candidate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    // Select mode: the user picked one of several candidates from an
    // ambiguous search — resolve that specific work instead of searching.
    if (body.candidate !== undefined) {
      if (!isValidCandidate(body.candidate)) {
        return NextResponse.json({ error: 'Invalid candidate' }, { status: 400 });
      }
      const candidate = body.candidate;
      const enrichment = await enrichMovieById(
        candidate,
        body.title?.trim() || candidate.title,
        body.year?.trim() || candidate.year,
      );
      return NextResponse.json(
        enrichment ? { status: 'found', enrichment } : { status: 'not_found' },
      );
    }

    // Search mode: title/year lookup, may come back ambiguous.
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    const result = await searchMovie(title, body.year?.trim() ?? '');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrichment failed:', error);
    await reportServerError({
      userId: auth.user.id,
      route: '/api/enrich',
      error,
      status: 500,
      // Which arm threw: candidate resolution or the search itself.
      detail: { mode: body.candidate !== undefined ? 'select' : 'search' },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
