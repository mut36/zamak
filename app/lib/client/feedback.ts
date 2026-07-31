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

/** The one finished job worth asking about on this visit, per
 *  pending_feedback_job() (0009). Mirrors /api/feedback/pending's shape. */
export interface PendingFeedbackItem {
  jobId: string;
  filename: string;
  model: string | null;
  completedAt: string;
  /** Signed URL to the stored result, or null if it could not be signed
   *  (missing/expired storage object) — the line-picker step skips itself
   *  when this is null. */
  resultUrl: string | null;
}

/**
 * Looks up the pending follow-up target, if any.
 *
 * Called once on app entry (see useFeedbackFollowup). Never throws — a failed
 * lookup just means no follow-up shows this visit, which is indistinguishable
 * from there being nothing pending.
 */
export async function fetchPendingFeedback(): Promise<PendingFeedbackItem | null> {
  try {
    const res = await fetch('/api/feedback/pending');
    if (!res.ok) return null;
    const data = (await res.json()) as { item?: PendingFeedbackItem | null };
    return data.item ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends the follow-up's answers: did they actually use it, what kind of
 * issue, which lines. Same upsert-by-job_id row as sendFeedback — the two
 * screens write disjoint fields, so answering this never erases a star
 * rating given earlier.
 */
export async function sendFollowup(
  jobId: string,
  usability: string,
  issueKinds: string[],
  reportedBlocks: number[],
  comment: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        usability,
        issueKinds,
        reportedBlocks,
        comment: comment || undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Records that the user closed the follow-up without answering, so it does
 *  not return on every visit forever. */
export async function dismissFollowup(jobId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, dismiss: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
