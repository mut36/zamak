'use client';

import { useState } from 'react';
import { joinWaitlist } from '../../lib/client/waitlist';
import type { CreditKind } from '../../lib/creditKind';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.exhausted;

interface ExhaustedStepProps {
  kind: CreditKind;
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
  defaultEmail,
  onGoHistory,
  onBack,
}: ExhaustedStepProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<JoinStatus>('idle');

  const kindLabel = kind === 'pro' ? c.kindPro : c.kindLite;

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
            0
          </span>
        </div>
        <div className='head'>
          <h1 className='!text-h1-sm'>{c.title(kindLabel)}</h1>
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
