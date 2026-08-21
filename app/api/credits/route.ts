import { NextResponse } from 'next/server';
import { createClient } from '../../lib/supabase/server';
import { requireUser } from '../../lib/server/auth';
import { UNLIMITED_CREDIT_DISPLAY } from '../../config/constants';

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

  // 무제한 테스터(0013)는 차감이 DB에서 면제되므로 실제 잔액이 0에 머문다.
  // 그대로 내보내면 번역은 되는데 화면만 "0편 남음"이 되므로 표시용 값으로
  // 바꿔 준다. 조회가 실패해도(표가 아직 없는 DB 등) 잔액 화면이 깨지면 안
  // 되니 에러는 삼키고 일반 계정으로 취급한다.
  //
  // 만료 조건은 begin_translation_job(0014)과 **같아야 한다** — 다르면 화면은
  // 무제한이라 하는데 번역은 거절당하는 상태가 생긴다.
  const { data: tester } = await supabase
    .from('unlimited_testers')
    .select('expires_at')
    .eq('user_id', auth.user.id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (tester) {
    return NextResponse.json({
      credits: {
        lite: UNLIMITED_CREDIT_DISPLAY,
        pro: UNLIMITED_CREDIT_DISPLAY,
        unlimitedUntil: tester.expires_at ?? null,
      },
      email: auth.user.email ?? null,
    });
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
