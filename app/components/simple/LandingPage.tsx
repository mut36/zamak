'use client';

import { useEffect, useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';

interface Props {
  onSignIn: () => void;
  error: string;
  configured: boolean;
}

/** ms per character of the wordmark reveal — プロトタイプ値. */
const TYPE_MS = 150;

export function LandingPage({ onSignIn, error, configured }: Props) {
  const word = COPY.landing.wordmark;
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setTyped(word.slice(0, i));
      if (i >= word.length) clearInterval(timer);
    }, TYPE_MS);
    return () => clearInterval(timer);
  }, [word]);

  return (
    <div className='min-h-screen flex flex-col items-center justify-center px-10 py-10'>
      <h1 className='mono mb-[18px] inline-block bg-ink text-accent text-[42px] font-semibold tracking-[0.07em] leading-none px-7 py-4 rounded-[6px] text-center min-h-[42px]'>
        {typed}
        <span className='animate-zblink inline-block w-1 h-[34px] bg-accent ml-2 rounded-[2px] align-[-3px]' />
      </h1>
      <p className='mb-10 text-[19px] text-ink-3 text-center max-w-[460px] leading-[1.5]'>
        {COPY.landing.tagline}
        <br />
        {COPY.landing.taglineSub}
      </p>
      {configured ? (
        <button
          type='button'
          onClick={onSignIn}
          className='flex items-center gap-2.5 bg-surface text-ink-body text-[15px] font-medium px-7 py-[13px] rounded-full border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-surface-2 active:scale-[0.98] transition'
        >
          <span className='w-[18px] h-[18px] rounded-full bg-accent text-ink flex items-center justify-center text-[11px] font-bold'>
            G
          </span>
          {COPY.landing.signIn}
        </button>
      ) : (
        <p className='text-sm text-danger'>{COPY.landing.notConfigured}</p>
      )}
      {error && <p className='mt-4 text-sm text-danger'>{error}</p>}
      <p className='mt-14 text-[12px] text-ink-5'>{COPY.landing.badge}</p>
    </div>
  );
}
