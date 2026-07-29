import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';
import { COPYRIGHT_NOTICE_VERSION } from '../../config/constants';

/** Whether this account has agreed to the CURRENT notice wording. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('copyright_consents')
    .select('version')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // An agreement to older wording does not carry forward — the modal shows
  // again, which is the point of versioning it.
  return NextResponse.json({
    agreed: data?.version === COPYRIGHT_NOTICE_VERSION,
  });
}

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { error } = await supabase.from('copyright_consents').upsert(
    {
      user_id: auth.user.id,
      version: COPYRIGHT_NOTICE_VERSION,
      agreed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
