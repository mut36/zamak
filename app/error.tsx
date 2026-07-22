'use client';

import { useEffect } from 'react';
import { BrandMark } from './components/BrandMark';
import { COPY } from './i18n/simpleCopy';

const c = COPY.error;

/**
 * Next's route-segment error boundary — catches errors during server
 * rendering and data fetching. Distinct from ErrorBoundary.tsx, which only
 * catches client-side render errors after hydration; both are needed.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className='min-h-screen flex flex-col items-center justify-center px-5 text-center'>
      <BrandMark className='mb-8' />
      <h1 className='text-[22px] font-bold text-ink mb-2'>{c.title}</h1>
      <p className='text-[14px] text-ink-2 mb-7 max-w-[320px]'>{c.body}</p>
      <button type='button' className='btn btn-primary btn-lg' onClick={reset}>
        {c.retry}
      </button>
    </div>
  );
}
