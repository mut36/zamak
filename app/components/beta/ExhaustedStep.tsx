'use client';

import { useEffect, useState } from 'react';
import { joinWaitlist } from '../../lib/client/waitlist';
import { recordEvent } from '../../lib/client/events';
import type { CreditKind } from '../../lib/creditKind';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.exhausted;

interface ExhaustedStepProps {
  kind: CreditKind;
  /** Credits this file needs and credits the account holds, straight from the
   *  ledger's refusal. Undefined when the server could not report them — the
   *  screen then falls back to its original "you are out" wording. */
  required?: number;
  have?: number;
  /** Signed-in account's email, pre-filling the form — the user shouldn't
   *  have to retype a value we already know. */
  defaultEmail: string;
  onGoHistory: () => void;
  onBack: () => void;
}

type JoinStatus = 'idle' | 'joining' | 'joined' | 'failed';

/**
 * Shown when the signed-in user has spent their last credit. Beta has no
 * payment flow yet, so this offers a real next step (waitlist registration)
 * instead of a dead end.
 */
export function ExhaustedStep({
  kind,
  required,
  have,
  defaultEmail,
  onGoHistory,
  onBack,
}: ExhaustedStepProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<JoinStatus>('idle');

  // Fires once per exposure (mount), not per click — the fact worth
  // measuring is that the user hit this dead end at all.
  useEffect(() => {
    void recordEvent('credits_exhausted_shown', { kind });
  }, [kind]);

  const kindLabel = kind === 'pro' ? c.kindPro : c.kindLite;
  // Both numbers or neither — a shortfall sentence with one of them missing
  // reads worse than the generic "you are out of credits".
  const shortOfThisFile =
    required !== undefined && have !== undefined && have > 0;

  const handleJoin = async () => {
    if (!email || status === 'joining') return;
    setStatus('joining');
    const result = await joinWaitlist(email);
    setStatus(result.ok ? 'joined' : 'failed');
  };

  return (
    <div className='animate-zslide max-w-[520px] mx-auto'>
      <div className='text-center mb-2'>
        <div className='bigcheck' style={{ background: 'var(--fill-hover)' }}>
          <span
            className='mono text-h2 font-bold leading-none'
            style={{ color: 'var(--ink)' }}
          >
            {have ?? 0}
          </span>
        </div>
        <div className='head'>
          {/* 잔액이 남아 있는데 이 파일에 모자란 것과, 정말 다 쓴 것은 다른
              사실이다 — 줄 수 차감(§6-22) 전에는 후자만 있었다. */}
          <h1 className='!text-h1-sm'>
            {shortOfThisFile ? c.shortTitle(kindLabel) : c.title(kindLabel)}
          </h1>
          {shortOfThisFile && (
            <p>{COPY.credits.shortfall(required as number, have as number)}</p>
          )}
          {c.body.split('\n').map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      <div className='card p-5 mt-6 text-center'>
        {status === 'joined' ? (
          <p className='text-body text-nav'>{c.joined}</p>
        ) : (
          <>
            <div className='text-body font-semibold text-ink-strong mb-3'>
              {c.waitlistLabel}
            </div>
            <input
              type='email'
              className='input'
              placeholder={c.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {status === 'failed' && (
              <p
                className='mt-2 text-fineprint'
                style={{ color: 'oklch(0.5 0.13 75)' }}
              >
                {c.joinFailed}
              </p>
            )}
            <button
              type='button'
              className='btn btn-primary btn-block mt-3'
              disabled={!email || status === 'joining'}
              onClick={handleJoin}
            >
              {c.join}
            </button>
          </>
        )}
      </div>

      <button
        type='button'
        className='btn btn-ghost btn-block mt-4'
        onClick={onGoHistory}
      >
        {c.goHistory}
      </button>
      <button
        type='button'
        className='btn btn-ghost btn-block mt-2'
        onClick={onBack}
      >
        {c.back}
      </button>
    </div>
  );
}
