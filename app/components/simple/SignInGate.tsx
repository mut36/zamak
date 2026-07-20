'use client';

import { useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.auth;

/** Google's mark, inlined so the sign-in button needs no external asset. */
function GoogleIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 18 18' aria-hidden='true'>
      <path
        fill='#4285F4'
        d='M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z'
      />
      <path
        fill='#34A853'
        d='M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z'
      />
      <path
        fill='#FBBC05'
        d='M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z'
      />
      <path
        fill='#EA4335'
        d='M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z'
      />
    </svg>
  );
}

interface SignInGateProps {
  onSignIn: () => Promise<void>;
  /** Server-side auth misconfiguration, or a failed OAuth round-trip. */
  error?: string;
  configured: boolean;
}

/**
 * What an anonymous visitor sees. Every route that spends the server key is
 * gated, so this is the whole app until someone signs in.
 */
export function SignInGate({ onSignIn, error, configured }: SignInGateProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      // The OAuth redirect usually navigates away before this runs; it matters
      // only when the redirect fails to start.
      setBusy(false);
    }
  };

  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{c.gateTitle}</h1>
        <p>{c.gateSubtitle}</p>
      </div>

      {(error || !configured) && (
        <div
          className='card p-4 mb-[14px] text-sm'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {configured ? error : c.notConfigured}
        </div>
      )}

      <div className='card p-[22px] flex flex-col items-center gap-4'>
        <button
          type='button'
          className='btn btn-primary btn-lg w-full flex items-center justify-center gap-2.5'
          disabled={busy || !configured}
          onClick={handleClick}
        >
          <GoogleIcon />
          {busy ? c.signingIn : c.signIn}
        </button>
        <p className='text-[12px] text-ink-3 text-center leading-relaxed'>
          {c.gateNote}
        </p>
      </div>

      <div className='reassure mt-5'>
        {COPY.upload.reassure.map((item, i) => (
          <span key={item} className='flex items-center gap-2'>
            {i > 0 && <span className='dot-sep' />}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
