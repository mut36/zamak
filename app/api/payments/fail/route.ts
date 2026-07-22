import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';

/**
 * Toss redirects here when the payment window ends without a payment — a
 * declined card, or simply the user closing it.
 *
 * Nothing was charged, so this only closes the pending order out and hands the
 * reason back to the UI. It stays a route rather than a client page so the
 * order does not sit as 'pending' forever when someone bails.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code') || 'UNKNOWN';
  const orderId = params.get('orderId');

  const auth = await requireUser();
  if (auth.ok && orderId) {
    const supabase = await createClient();
    await supabase.rpc('fail_order', { p_order_id: orderId, p_code: code });
  }

  const home = new URL('/', request.nextUrl.origin);
  home.searchParams.set('purchase', 'failed');
  home.searchParams.set('code', code);
  return NextResponse.redirect(home);
}
