import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { enforceRateLimit } from '../../../lib/server/rateLimit';
import {
  normalizeCouponCode,
  isCouponRedeemStatus,
} from '../../../lib/coupon';
import { COUPON_CODE_MAX_LENGTH } from '../../../config/constants';

interface RedeemRow {
  status: string;
  expires_at: string | null;
}

/**
 * 비밀코드를 기간제 무제한으로 바꾼다.
 *
 * 라우트는 얇다 — 유효성·정원·중복 판정은 전부 `redeem_coupon`(0014) 안에
 * 있다. 그래야 판정과 지급이 한 트랜잭션이고, coupons 표를 클라이언트에
 * 한 번도 노출하지 않는다.
 *
 * 이 경로는 `enforceRateLimit`이 **fail-open**인 몇 안 되는 예외를 감수한다:
 * 대입 시도를 막는 게 목적이지만, 진짜 천장은 여기가 아니라 `max_redemptions`
 * (정원 10명)다. 한도가 잠깐 열려도 쿠폰이 무한히 풀리지는 않는다.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limit = await enforceRateLimit('coupon');
  if (!limit.ok) return limit.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = typeof body.code === 'string' ? body.code : '';
  const code = normalizeCouponCode(raw.slice(0, COUPON_CODE_MAX_LENGTH));
  if (!code) {
    return NextResponse.json({ error: 'missing code' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('redeem_coupon', {
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // returns table (...) 이므로 행 배열로 온다.
  const row = Array.isArray(data) ? (data[0] as RedeemRow | undefined) : undefined;
  const status = isCouponRedeemStatus(row?.status) ? row.status : 'invalid';

  return NextResponse.json({
    status,
    expiresAt: status === 'invalid' ? null : (row?.expires_at ?? null),
  });
}
