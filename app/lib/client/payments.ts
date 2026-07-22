'use client';

import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

interface PreparedOrder {
  orderId: string;
  amount: number;
  orderName: string;
  clientKey: string;
  customerKey: string;
  customerEmail: string | null;
}

/**
 * Opens the Toss payment window for a pack.
 *
 * On success the browser leaves this page: Toss redirects to
 * /api/payments/confirm, which approves the payment and grants the credits.
 * Nothing here decides the price — the amount comes back from /prepare, which
 * has already written it into the order row.
 *
 * Resolves only when the window could not be opened; a successful request
 * navigates away instead.
 */
export async function startPurchase(packId: string): Promise<string> {
  const res = await fetch('/api/payments/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error || 'prepare_failed';
  }

  const order = (await res.json()) as PreparedOrder;
  const origin = window.location.origin;

  const tossPayments = await loadTossPayments(order.clientKey);
  const payment = tossPayments.payment({ customerKey: order.customerKey });

  try {
    await payment.requestPayment({
      // CARD covers credit cards and the domestic easy-pay wallets. Virtual
      // accounts are deliberately not offered: they settle hours later via a
      // webhook we do not have, so a "paid" order could sit ungranted.
      method: 'CARD',
      amount: { currency: 'KRW', value: order.amount },
      orderId: order.orderId,
      orderName: order.orderName,
      ...(order.customerEmail ? { customerEmail: order.customerEmail } : {}),
      successUrl: `${origin}/api/payments/confirm`,
      failUrl: `${origin}/api/payments/fail`,
      card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
    });
    return '';
  } catch (error) {
    // Closing the window throws too, and that is not an error worth showing.
    const code = (error as { code?: string })?.code ?? '';
    return code === 'USER_CANCEL' ? '' : code || 'payment_failed';
  }
}
