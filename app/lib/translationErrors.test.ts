import { describe, expect, it } from 'vitest';
import {
  classifyError,
  codeForHttpStatus,
  computeRetryBudget,
  isFatalCode,
  isRetryableCode,
  TranslationError,
} from './translationErrors';

describe('codeForHttpStatus', () => {
  it('maps 429 to quota', () => {
    expect(codeForHttpStatus(429)).toBe('quota');
  });

  it('maps 401/403 to auth', () => {
    expect(codeForHttpStatus(401)).toBe('auth');
    expect(codeForHttpStatus(403)).toBe('auth');
  });

  it('maps any 5xx to transient', () => {
    expect(codeForHttpStatus(500)).toBe('transient');
    expect(codeForHttpStatus(503)).toBe('transient');
  });

  it('maps anything else to unknown', () => {
    expect(codeForHttpStatus(418)).toBe('unknown');
  });
});

describe('classifyError', () => {
  it('passes an already-typed TranslationError through unchanged', () => {
    expect(classifyError(new TranslationError('boom', 'safety'))).toBe('safety');
  });

  it('reads an HTTP status embedded in a "Server error (NNN)" message', () => {
    expect(classifyError(new Error('Server error (429)'))).toBe('quota');
    expect(classifyError(new Error('Server error (503)'))).toBe('transient');
  });

  it('classifies a quota message without a status code', () => {
    expect(classifyError(new Error('Quota exceeded for this project'))).toBe(
      'quota',
    );
  });

  it('classifies an invalid/expired job as auth', () => {
    expect(classifyError(new Error('invalid_or_expired_job'))).toBe('auth');
  });

  it('classifies a Gemini safety block', () => {
    expect(
      classifyError(new Error('Gemini safety filter blocked the response')),
    ).toBe('safety');
  });

  it('classifies a MAX_TOKENS truncation as oversize', () => {
    expect(
      classifyError(new Error('Gemini output was truncated: MAX_TOKENS reached')),
    ).toBe('oversize');
  });

  it('classifies a fetch-level TypeError as transient', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('transient');
  });

  it('classifies an AbortSignal.timeout() DOMException as transient', () => {
    expect(classifyError(new DOMException('signal timed out', 'TimeoutError'))).toBe(
      'transient',
    );
  });

  it('falls back to unknown for an unrecognized error', () => {
    expect(classifyError(new Error('something bizarre happened'))).toBe(
      'unknown',
    );
  });
});

describe('isFatalCode / isRetryableCode', () => {
  it('treats quota and auth as fatal, nothing else', () => {
    expect(isFatalCode('quota')).toBe(true);
    expect(isFatalCode('auth')).toBe(true);
    expect(isFatalCode('transient')).toBe(false);
    expect(isFatalCode('safety')).toBe(false);
    expect(isFatalCode('oversize')).toBe(false);
    expect(isFatalCode('align')).toBe(false);
    expect(isFatalCode('unknown')).toBe(false);
  });

  it('treats transient and align as retryable, nothing else', () => {
    expect(isRetryableCode('transient')).toBe(true);
    expect(isRetryableCode('align')).toBe(true);
    expect(isRetryableCode('quota')).toBe(false);
    expect(isRetryableCode('auth')).toBe(false);
    expect(isRetryableCode('safety')).toBe(false);
    expect(isRetryableCode('oversize')).toBe(false);
    expect(isRetryableCode('unknown')).toBe(false);
  });
});

describe('computeRetryBudget', () => {
  it('floors small files at 3 extra calls', () => {
    expect(computeRetryBudget(1)).toBe(3);
    expect(computeRetryBudget(10)).toBe(3);
  });

  it('scales to 20% of the chunk count above the floor', () => {
    expect(computeRetryBudget(50)).toBe(10);
    expect(computeRetryBudget(100)).toBe(20);
  });

  it('rounds up so a fractional 20% still gets a whole call', () => {
    expect(computeRetryBudget(21)).toBe(5); // 4.2 -> 5
  });
});
