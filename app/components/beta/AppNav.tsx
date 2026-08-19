'use client';

import Link from 'next/link';
import type { CreditBalances } from '../../lib/creditKind';
import { COPY } from '../../i18n/simpleCopy';
import { BrandMark } from '../BrandMark';

interface AppNavProps {
  credits: CreditBalances | null;
  onHome: () => void;
}

/**
 * Sticky top bar for the signed-in shell. Credit balances are a read-only chip;
 * "마이페이지" goes to /mypage. Sign-out lives on the mypage screen itself.
 */
export function AppNav({ credits, onHome }: AppNavProps) {
  return (
    <>
    <nav className='fixed top-0 left-0 right-0 z-40 h-[52px] glass-nav backdrop-blur-[20px] backdrop-saturate-[180%]'>
      <div className='flex h-full w-full max-w-[840px] mx-auto items-center justify-between px-5 sm:px-10'>
        <BrandMark size={24} onClick={onHome} />

        <div className='flex items-center gap-3'>
          {credits && (
            <span className='inline-flex items-center rounded-[var(--r-btn)] bg-[var(--fill-hover)] px-[13px] py-1.5 text-fineprint font-medium text-ink'>
              {COPY.nav.credits(credits.lite, credits.pro)}
            </span>
          )}

          <Link
            href='/polish'
            className='text-caption text-nav hover:bg-[var(--fill-hover)] rounded-[var(--r-btn)] px-3 py-1.5 transition'
          >
            {COPY.polish.navLink}
          </Link>

          <Link
            href='/mypage'
            className='text-caption text-nav hover:bg-[var(--fill-hover)] rounded-[var(--r-btn)] px-3 py-1.5 transition'
          >
            {COPY.nav.mypage}
          </Link>
        </div>
      </div>
    </nav>
    {/* Spacer so fixed nav doesn't cover page content. */}
    <div className='h-[52px]' aria-hidden />
    </>
  );
}
