import type { HistoryItem, JobOptions } from '../jobHistory';

/**
 * Stores the finished translation so it can be downloaded again later.
 *
 * Returns false rather than throwing: the user already has the file in the
 * browser, so a failed upload costs them the re-download, not the translation.
 */
export async function saveResult(
  jobId: string,
  filename: string,
  content: string,
  options: JobOptions,
): Promise<boolean> {
  try {
    const res = await fetch('/api/translation/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, filename, content, options }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const res = await fetch('/api/translation/history');
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as { items?: HistoryItem[] } | null;
  return body?.items ?? [];
}
