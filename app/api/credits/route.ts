import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Current user's credit balance, for the header chip and the paywall copy. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits')
    .select('balance')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    // No row yet means the signup trigger has not fired; treat as zero rather
    // than erroring, so the UI shows the paywall instead of breaking.
    balance: data?.balance ?? 0,
    email: auth.user.email ?? null,
  });
}
