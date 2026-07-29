/**
 * Sends a rating for a finished translation.
 *
 * Returns false instead of throwing: a failed rating must never take down the
 * completion screen the user is standing on, and there is nothing they could
 * do about it anyway.
 */
export async function sendFeedback(
  jobId: string,
  rating: number,
  comment: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, rating, comment: comment || undefined }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
