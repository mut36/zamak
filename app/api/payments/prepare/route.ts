import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { requireUser } from '../../../lib/server/auth';
import { findPack, orderNameFor } from '../../../config/packs';
import { TOSS_CLIENT_KEY, isTossConfigured } from '../../../lib/server/toss';

/**
 * Opens a pending order and returns what the payment window needs.
 *
 * This exists so the amount is decided here rather than in the browser. The
 * client sends a pack id; the price comes from our table and is written to the
 * order row, and settlement later refuses anything that does not match it.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  if (!isTossConfigured) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 500 });
  }

  let body: { packId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pack = typeof body.packId === 'string' ? findPack(body.packId) : undefined;
  if (!pack) {
    return NextResponse.json({ error: 'unknown_pack' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_order', {
    p_pack_id: pack.id,
    p_credits: pack.credits,
    p_amount: pack.amount,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    orderId: data as string,
    amount: pack.amount,
    orderName: orderNameFor(pack),
    clientKey: TOSS_CLIENT_KEY,
    // Toss keys the saved-card list off this. The user id keeps a returning
    // customer's cards without exposing anything the browser cannot see anyway.
    customerKey: auth.user.id,
    customerEmail: auth.user.email ?? null,
  });
}
