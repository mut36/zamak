import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';

/** Current user's credit balances, for the nav chip and the settings cards. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits')
    .select('lite_balance, pro_balance')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    // No row yet means the signup trigger has not fired; treat as zero rather
    // than erroring, so the UI shows the exhausted screen instead of breaking.
    credits: {
      lite: data?.lite_balance ?? 0,
      pro: data?.pro_balance ?? 0,
    },
    email: auth.user.email ?? null,
  });
}
