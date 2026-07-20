/** Raised when the server refuses to open a job, with a code the UI can branch on. */
export class JobRefusedError extends Error {
  constructor(
    /** 'insufficient_credits' | 'file_too_large' | 'unauthorized' | 'unknown' */
    readonly code: string,
    message: string,
    readonly maxBlocks?: number,
  ) {
    super(message);
    this.name = 'JobRefusedError';
  }
}

/**
 * Opens a translation job, spending one credit, and returns its id.
 *
 * Called once per file before any chunk goes out — the chunk endpoint rejects
 * requests that do not carry a job the caller paid for.
 */
export async function beginTranslationJob(
  totalBlocks: number,
): Promise<string> {
  const res = await fetch('/api/translation/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totalBlocks }),
  });

  const body = (await res.json().catch(() => null)) as {
    jobId?: string;
    error?: string;
    maxBlocks?: number;
  } | null;

  if (!res.ok) {
    const code =
      res.status === 401
        ? 'unauthorized'
        : typeof body?.error === 'string'
          ? body.error
          : 'unknown';
    throw new JobRefusedError(
      code,
      body?.error ?? `Server error (${res.status})`,
      body?.maxBlocks,
    );
  }

  if (!body?.jobId) {
    throw new JobRefusedError('unknown', 'No job id returned');
  }

  return body.jobId;
}
