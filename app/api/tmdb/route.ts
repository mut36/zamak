import { NextRequest, NextResponse } from 'next/server';
import { lookupTitle, TmdbNotConfiguredError } from '../../lib/server/tmdb';

export const maxDuration = 15;

/**
 * Movie/drama metadata lookup via TMDB. Unlike the Gemini routes this needs no
 * user BYOK key — it uses the server-side TMDB_API_KEY (free, no cost bomb).
 * POST { title, year? } → normalized metadata + posterUrl.
 */
export async function POST(request: NextRequest) {
  let body: { title?: string; year?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  try {
    const result = await lookupTitle(title, body.year);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TmdbNotConfiguredError) {
      console.error('TMDB lookup failed: server key not configured');
      return NextResponse.json(
        { error: 'TMDB is not configured on the server' },
        { status: 500 },
      );
    }
    // Network/parse errors degrade to "not found" so the UI can fall back to
    // manual input instead of surfacing a hard error.
    console.error('TMDB lookup failed:', error);
    return NextResponse.json({ found: false });
  }
}
