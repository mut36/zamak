import type { AllowedModel } from '../../config/constants';
import type { CreditKind } from '../creditKind';

/** Raised when the server refuses to open a job, with a code the UI can branch on. */
export class JobRefusedError extends Error {
  readonly code: string;
  readonly maxBlocks?: number;
  /** Which balance ran out. Set only for `insufficient_credits`. */
  readonly kind?: CreditKind;

  constructor(code: string, message: string, maxBlocks?: number, kind?: CreditKind) {
    super(message);
    this.name = 'JobRefusedError';
    this.code = code;
    this.maxBlocks = maxBlocks;
    this.kind = kind;
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
  model: AllowedModel,
): Promise<string> {
  const res = await fetch('/api/translation/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totalBlocks, model }),
  });

  const body = (await res.json().catch(() => null)) as {
    jobId?: string;
    error?: string;
    maxBlocks?: number;
    kind?: CreditKind;
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
      body?.kind,
    );
  }

  if (!body?.jobId) {
    throw new JobRefusedError('unknown', 'No job id returned');
  }

  return body.jobId;
}
