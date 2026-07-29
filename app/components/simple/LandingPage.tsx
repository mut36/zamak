'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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

      {/* signup-wrap. 가입이라는 능동적 행위에 결합돼 있어 푸터 링크(browsewrap)
          단독보다 효력이 안정적이다 — docs/decisions.md §1-11이 고른 3개 노출
          지점 중 두 번째. 로그인 버튼이 없으면 "계속하면"이 가리킬 행위도 없다. */}
      {configured && (
        <p className='mt-4 max-w-[320px] text-center text-[12px] leading-[1.6] text-ink-5'>
          {COPY.legal.consentPrefix}
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.terms}
          </Link>
          {COPY.legal.consentAnd}
          <Link href={COPY.legal.privacyHref} className='underline'>
            {COPY.legal.privacy}
          </Link>
          {COPY.legal.consentSuffix}
        </p>
      )}

      {error && <p className='mt-4 text-sm text-danger'>{error}</p>}

      {/* §1-11의 세 번째 노출 지점. 로그인 전 화면은 이 푸터가 유일한 약관 경로다
          — 로그인 후 셸의 푸터(app/page.tsx)에는 익명 방문자가 닿지 못한다. */}
      <footer className='mt-14 flex flex-col items-center gap-1.5 text-[12px] text-ink-5'>
        <p className='m-0'>{COPY.landing.badge}</p>
        <div className='flex items-center gap-2.5'>
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.terms}
          </Link>
          <span className='dot-sep' />
          <Link href={COPY.legal.privacyHref} className='underline'>
            {COPY.legal.privacy}
          </Link>
        </div>
      </footer>
    </div>
  );
}
