'use client';

import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import type { CreditBalances } from '../../lib/creditKind';
import { COPY } from '../../i18n/simpleCopy';
import { BrandMark } from '../BrandMark';

interface AppNavProps {
  /** Passed in rather than read from useAuth() here: useAuth is a plain hook,
   *  not a context, so a second call inside this nav would open its own
   *  onAuthStateChange subscription and re-fetch /api/credits on every page. */
  user: User | null;
  signOut: () => void;
  credits: CreditBalances | null;
  onHome: () => void;
}

/**
 * Sticky top bar for the signed-in shell. Wordmark badge goes home; "내 번역"
 * and the credit pill both open /mypage. Avatar signs out (beta has no account
 * menu yet).
 */
export function AppNav({ user, signOut, credits, onHome }: AppNavProps) {
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
    <nav className='sticky top-0 z-40 h-[52px] border-b border-border-subtle glass-nav'>
      <div className='flex h-full w-full max-w-[600px] lg:max-w-[840px] mx-auto items-center justify-between px-5'>
        <BrandMark size={24} onClick={onHome} />

        <div className='flex items-center gap-4'>
          <Link
            href='/mypage'
            className='text-caption text-nav hover:bg-[var(--fill-hover)] rounded-[var(--r-btn)] px-3 py-1.5 transition'
          >
            {COPY.nav.history}
          </Link>

          {credits && (
            <Link
              href='/mypage'
              className='inline-flex items-center rounded-[var(--r-btn)] bg-[var(--fill-hover)] px-[13px] py-1.5 text-fineprint font-medium text-ink hover:bg-[var(--fill-hover-strong)] transition'
            >
              {COPY.nav.credits(credits.lite, credits.pro)}
            </Link>
          )}

          <button
            type='button'
            onClick={signOut}
            aria-label={COPY.nav.signOut}
            title={COPY.nav.signOut}
            className='flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#c8c8cd] to-[#a9a9af]'
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
              <span className='text-fineprint font-semibold text-white'>
                {initial}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
