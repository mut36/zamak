import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import {
  confirmPayment,
  fetchPaymentByOrderId,
  isTossConfigured,
} from '../../../lib/server/toss';

/**
 * Toss redirects here when the user finishes the payment window.
 *
 * It is the success URL rather than a client page on purpose: approving the
 * payment must not depend on the browser running our JavaScript, and doing it
 * server-side means the amount we approve is the one we recorded, never one
 * that arrived in a query string.
 *
 * A GET that moves money is unusual, but this is a top-level redirect from an
 * external site, so it is the only shape available. Everything downstream is
 * therefore idempotent: the user can reload this URL and will not be charged
 * again or granted twice.
 */
export async function GET(request: NextRequest) {
  const home = new URL('/', request.nextUrl.origin);
  const back = (params: Record<string, string>) => {
    Object.entries(params).forEach(([k, v]) => home.searchParams.set(k, v));
    return NextResponse.redirect(home);
  };

  const auth = await requireUser();
  // The session cookie rides along on this top-level navigation. If it somehow
  // did not, the payment is still recoverable from the order row — but say so
  // rather than pretending nothing happened.
  if (!auth.ok) return back({ purchase: 'failed', code: 'SESSION_LOST' });

  if (!isTossConfigured) {
    return back({ purchase: 'failed', code: 'NOT_CONFIGURED' });
  }

  const orderId = request.nextUrl.searchParams.get('orderId');
  const paymentKey = request.nextUrl.searchParams.get('paymentKey');
  if (!orderId || !paymentKey) {
    return back({ purchase: 'failed', code: 'MISSING_PARAMS' });
  }

  // The order row, not the query string, is the source of truth for the price.
  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('amount, status, credits')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    return back({ purchase: 'failed', code: 'ORDER_NOT_FOUND' });
  }

  // Already settled — a reload, not a second purchase.
  if (order.status === 'paid') {
    return back({ purchase: 'done', credits: String(order.credits) });
  }

  let result = await confirmPayment({
    paymentKey,
    orderId,
    amount: order.amount,
  });

  // The money moved on an earlier attempt whose response we lost. Read the
  // payment back so that attempt can still be settled.
  if (!result.ok && result.code === 'ALREADY_PROCESSED_PAYMENT') {
    result = await fetchPaymentByOrderId(orderId);
  }

  if (!result.ok) {
    await supabase.rpc('fail_order', { p_order_id: orderId, p_code: result.code });
    return back({ purchase: 'failed', code: result.code });
  }

  const payment = result.payment;
  if (payment.status !== 'DONE') {
    // Only instant methods are offered (see the payment window options), so a
    // non-DONE status here is not a pending bank transfer — it is a failure.
    await supabase.rpc('fail_order', { p_order_id: orderId, p_code: payment.status });
    return back({ purchase: 'failed', code: payment.status });
  }

  const { data: settled, error: settleError } = await supabase.rpc('settle_order', {
    p_order_id: orderId,
    p_payment_key: payment.paymentKey,
    p_amount: payment.totalAmount,
    p_method: payment.method ?? null,
    p_receipt_url: payment.receipt?.url ?? null,
  });

  if (settleError) {
    // Paid but not granted. The order row holds the paymentKey and amount, so
    // this is recoverable by hand; surface it loudly rather than silently.
    console.error('[payments] settle failed for', orderId, settleError.message);
    return back({ purchase: 'failed', code: 'SETTLE_FAILED' });
  }

  const row = Array.isArray(settled) ? settled[0] : settled;
  return back({
    purchase: 'done',
    credits: String(row?.credits_granted ?? order.credits),
  });
}
