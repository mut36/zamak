import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../lib/server/auth';
import { enrichMovie } from '../../lib/server/enrichMovie';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  // Signed-in only; no credit charged (see /api/analyze).
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

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
    const result = await enrichMovie(title, body.year?.trim() ?? '');
    return NextResponse.json(result ?? { found: false });
  } catch (error) {
    console.error('Enrichment failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
