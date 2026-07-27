import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { extractCastSheet } from '../../lib/server/extractCastSheet';
import { EMPTY_CAST_SHEET } from '../../types/glossary';
import { DEFAULT_TARGET_LANG } from '../../config/languages';

export const maxDuration = 60;

interface GlossaryRequest {
  /** Raw subtitle content (SRT), full file. */
  content: string;
  movieInfo?: {
    title?: string;
    year?: string;
    genre?: string;
    country?: string;
    era?: string;
    tone?: string;
  };
  /** Target language code; decides the spelling language and whether a
   * formality axis is asked for at all. Defaults to Korean. */
  targetLang?: string;
}

export async function POST(request: NextRequest) {
  // Signed-in only; no credit charged — this is an opt-in prepass, not
  // billed translation (see /api/summarize, /api/enrich for the same policy).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: GlossaryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json(EMPTY_CAST_SHEET);
  }

  try {
    const sheet = await extractCastSheet(body.content, {
      title: body.movieInfo?.title ?? '',
      year: body.movieInfo?.year ?? '',
      genre: body.movieInfo?.genre,
      country: body.movieInfo?.country,
      era: body.movieInfo?.era,
      tone: body.movieInfo?.tone,
    },
    // resolveTargetLang falls back to Korean for anything unknown — this
    // prepass is best-effort and must never 400 the info step.
    typeof body.targetLang === 'string' ? body.targetLang : DEFAULT_TARGET_LANG);
    return NextResponse.json(sheet);
  } catch (error) {
    console.error('[glossary] request failed:', error);
    // Never a hard failure for the caller — an empty sheet degrades to
    // today's behavior instead of blocking the info step.
    return NextResponse.json(EMPTY_CAST_SHEET);
  }
}
