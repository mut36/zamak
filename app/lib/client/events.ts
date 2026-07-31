import type { BetaEvent } from '../../config/constants';

/**
 * Records a funnel step. Same fire-and-forget contract as sendRunMetrics: a
 * lost event is our problem, never the user's, so every failure is swallowed
 * here rather than surfaced.
 */
export async function recordEvent(
  event: BetaEvent,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, detail }),
      // A download click or the exhausted screen can be the last thing a tab
      // does before closing; this is exactly the case keepalive exists for.
      keepalive: true,
    });
  } catch {
    // Measurement is never worth an error the user can see.
  }
}
