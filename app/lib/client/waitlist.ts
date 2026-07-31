/**
 * Joins the payment-launch waitlist.
 *
 * Unlike feedback this reports failure, because the user is waiting on a
 * confirmation and an address we never stored is a promise we cannot keep.
 */
export async function joinWaitlist(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: body?.error ?? 'unknown' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
