import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Deliberately loose: we are collecting an address to mail later, not
 *  authenticating with it. Rejecting a typo'd address the user can see and
 *  retype is fine; rejecting a valid unusual one is not. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Records interest in paid credits, for the beta's exhausted screen. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim();
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('waitlist')
    .upsert({ user_id: auth.user.id, email }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
