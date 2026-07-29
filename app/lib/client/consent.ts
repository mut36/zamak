/**
 * Whether the signed-in user has agreed to the current copyright notice.
 *
 * Fails closed (returns false → modal shows). Showing the notice one extra
 * time is harmless; skipping it because a fetch failed is not.
 */
export async function fetchConsent(): Promise<boolean> {
  try {
    const res = await fetch('/api/consent');
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { agreed?: boolean } | null;
    return body?.agreed === true;
  } catch {
    return false;
  }
}

/** Records agreement. Returns false when it did not stick, so the caller can
 *  keep the user on the modal rather than proceeding on an unsaved consent. */
export async function recordConsent(): Promise<boolean> {
  try {
    const res = await fetch('/api/consent', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}
