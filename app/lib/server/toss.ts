import 'server-only';

/**
 * Toss Payments server API.
 *
 * Only two calls are needed for prepaid credits: confirm a payment the browser
 * just completed, and look one up by order id when confirm says it was already
 * processed. Refunds are deliberately not here — they are handled from the Toss
 * dashboard until there is enough volume to justify a button (docs/decisions.md).
 */

const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

/** Server-only. Never send this to the browser. */
export const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY || '';
/** Safe in the browser by design — it only opens a payment window. */
export const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

/**
 * Whether payments are wired up. Checked explicitly so a missing key produces
 * "결제가 아직 설정되지 않았어요" instead of an opaque 401 from Toss.
 */
export const isTossConfigured = Boolean(TOSS_SECRET_KEY && TOSS_CLIENT_KEY);

/** Basic auth with the secret key as the username and an empty password. */
function authHeader(): string {
  return `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`;
}

/** The subset of the Payment object we act on or store. */
export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  method?: string | null;
  totalAmount: number;
  receipt?: { url?: string } | null;
}

export type TossResult =
  | { ok: true; payment: TossPayment }
  | { ok: false; code: string; message: string };

async function readError(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as { code?: string; message?: string };
    return {
      code: body.code || 'UNKNOWN',
      message: body.message || `Toss responded ${response.status}`,
    };
  } catch {
    return { code: 'UNKNOWN', message: `Toss responded ${response.status}` };
  }
}

/**
 * Approves a payment the user has just authorised.
 *
 * Until this returns, no money has moved — the payment window only produces a
 * paymentKey. `amount` is the amount we recorded when the order was opened, not
 * anything the browser sent us, so a mismatched request fails here rather than
 * silently over- or under-charging.
 *
 * The idempotency key is the order id: a retry of the same order is the same
 * call, which is what makes the reloadable success URL safe.
 */
export async function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossResult> {
  const response = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': params.orderId,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) return { ok: false, ...(await readError(response)) };
  return { ok: true, payment: (await response.json()) as TossPayment };
}

/**
 * Fetches a payment by our order id.
 *
 * Used for one case: confirm came back ALREADY_PROCESSED_PAYMENT, which means
 * the money moved on an earlier attempt whose response we lost. Reading the
 * payment back lets that attempt still be settled instead of leaving a paid
 * order with no credits.
 */
export async function fetchPaymentByOrderId(orderId: string): Promise<TossResult> {
  const response = await fetch(
    `${TOSS_API_BASE}/payments/orders/${encodeURIComponent(orderId)}`,
    { headers: { Authorization: authHeader() } },
  );

  if (!response.ok) return { ok: false, ...(await readError(response)) };
  return { ok: true, payment: (await response.json()) as TossPayment };
}
