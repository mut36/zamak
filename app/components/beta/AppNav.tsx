'use client';

import Link from 'next/link';
import type { CreditBalances } from '../../lib/creditKind';
import { useAuth } from '../../hooks/useAuth';
import { COPY } from '../../i18n/simpleCopy';

interface AppNavProps {
  credits: CreditBalances | null;
  onHome: () => void;
}

/**
 * Sticky top bar for the signed-in shell. Wordmark badge goes home; "내 번역"
 * and the credit pill both open /mypage. Avatar signs out (beta has no account
 * menu yet).
 */
export function AppNav({ credits, onHome }: AppNavProps) {
  const { user, signOut } = useAuth();

  const meta = user?.user_metadata as
    | { avatar_url?: string; picture?: string; full_name?: string }
    | undefined;
  const avatarUrl = meta?.avatar_url || meta?.picture || null;
  const initial = (
    user?.email?.[0] ??
    meta?.full_name?.[0] ??
    '?'
  ).toUpperCase();

  return (
    <nav className='sticky top-0 z-40 h-14 border-b border-border bg-[var(--nav-bg)] backdrop-blur-[20px] backdrop-saturate-[180%]'>
      <div className='flex h-full w-full max-w-[600px] lg:max-w-[840px] mx-auto items-center justify-between px-5'>
        <button
          type='button'
          onClick={onHome}
          aria-label='ZAMAK home'
          className='mono inline-flex items-center rounded-[4px] bg-ink px-2.5 py-1.5 text-[13px] font-semibold tracking-[0.07em] leading-none text-accent'
        >
          {COPY.brand}
        </button>

        <div className='flex items-center gap-3'>
          <Link
            href='/mypage'
            className='text-[13px] font-medium text-ink-2 hover:text-ink'
          >
            {COPY.nav.history}
          </Link>

          {credits && (
            <Link
              href='/mypage'
              className='inline-flex items-center rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-ink'
            >
              {COPY.nav.credits(credits.lite, credits.pro)}
            </Link>
          )}

          <button
            type='button'
            onClick={signOut}
            aria-label={COPY.nav.signOut}
            title={COPY.nav.signOut}
            className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-border'
          >
            {avatarUrl ? (
              // Google OAuth avatar — remote host varies; next/image needs a
              // remotePatterns allowlist we don't want to maintain for this.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=''
                className='h-full w-full object-cover'
                referrerPolicy='no-referrer'
              />
            ) : (
              <span className='text-[12px] font-semibold text-ink-2'>
                {initial}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
