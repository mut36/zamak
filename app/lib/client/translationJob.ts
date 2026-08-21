import type { AllowedModel } from '../../config/constants';
import type { CreditKind } from '../creditKind';

/** Raised when the server refuses to open a job, with a code the UI can branch on. */
export class JobRefusedError extends Error {
  readonly code: string;
  /** Which balance ran out. Set only for `insufficient_credits`. */
  readonly kind?: CreditKind;
  /** Credits the file needs / credits the account has. Set only for
   *  `insufficient_credits`, and only when the server could parse them out of
   *  the ledger's exception — the screen falls back to a countless sentence
   *  when they are absent. */
  readonly required?: number;
  readonly have?: number;

  constructor(
    code: string,
    message: string,
    kind?: CreditKind,
    required?: number,
    have?: number,
  ) {
    super(message);
    this.name = 'JobRefusedError';
    this.code = code;
    this.kind = kind;
    this.required = required;
    this.have = have;
  }
}

/**
 * Opens a translation job, spending credits, and returns its id and the charge.
 *
 * Called once per file before any chunk goes out — the chunk endpoint rejects
 * requests that do not carry a job the caller paid for.
 *
 * The returned `credits` is the server's number, not a client recomputation.
 * The upload screen predicts the charge with `creditsForBlocks` so the user
 * sees it before pressing start; this is what was actually taken.
 */
export async function beginTranslationJob(
  totalBlocks: number,
  model: AllowedModel,
): Promise<{ jobId: string; credits: number }> {
  const res = await fetch('/api/translation/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ totalBlocks, model }),
  });

  const body = (await res.json().catch(() => null)) as {
    jobId?: string;
    credits?: number;
    error?: string;
    kind?: CreditKind;
    required?: number;
    have?: number;
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
      body?.kind,
      body?.required,
      body?.have,
    );
  }

  if (!body?.jobId) {
    throw new JobRefusedError('unknown', 'No job id returned');
  }

  return { jobId: body.jobId, credits: body.credits ?? 1 };
}
