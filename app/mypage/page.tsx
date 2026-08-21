'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '../components/beta/AppNav';
import { SiteFooter } from '../components/SiteFooter';
import { CouponRedeemCard } from '../components/CouponRedeemCard';
import { useAuth } from '../hooks/useAuth';
import { fetchHistory } from '../lib/client/history';
import type { HistoryItem } from '../lib/jobHistory';
import { PRO_MODEL, RESULT_RETENTION_DAYS } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';

const c = COPY.mypage;

function CreditCard({ label, count }: { label: string; count: number }) {
  return (
    <div className='card p-[22px_24px]'>
      <div className='text-caption text-tertiary'>{label}</div>
      <div className='mt-1 flex items-baseline gap-1'>
        <span className='text-h1-sm font-semibold tracking-[-0.01em] leading-none'>
          {count}
        </span>
        <span className='text-title-sm font-normal text-tertiary'>{c.unit}</span>
      </div>
    </div>
  );
}

/**
 * 무제한 계정(운영자 또는 쿠폰 사용자)의 잔액 카드.
 *
 * 잔액 숫자를 아예 안 쓴다 — /api/credits가 표시용으로 내려보내는 999를 그대로
 * 그리면 "999회 남음"이라는 거짓말이 된다. 만료가 있으면 언제까지인지가 이
 * 화면에서 유일하게 의미 있는 숫자다.
 */
function UnlimitedCreditCard({ until }: { until: string | null }) {
  return (
    <div className='card p-[22px_24px]'>
      <div className='text-caption text-tertiary'>{c.unlimitedTitle}</div>
      <div className='mt-1 flex items-baseline gap-2'>
        <span className='text-h1-sm font-semibold tracking-[-0.01em] leading-none'>
          {c.unlimited}
        </span>
        {until && (
          <span className='text-title-sm font-normal text-tertiary'>
            {c.unlimitedUntil(until)}
          </span>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  // Never show the raw model id on screen — map to the two display names.
  const modelLabel =
    item.model === PRO_MODEL ? COPY.settings.proName : COPY.settings.liteName;
  const date = new Date(item.createdAt).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  });
  // A null downloadUrl (old job whose upload failed) gets the same locked
  // treatment as an expired one — either way there is nothing to hand back.
  const downloadUrl = item.expired ? null : item.downloadUrl;

  return (
    <div className='card p-[18px_24px] flex items-center gap-4'>
      <div className='min-w-0 flex-1'>
        <div className='mono text-caption truncate'>{item.filename}</div>
        <div className='text-caption-sm text-tertiary mt-[3px]'>
          {c.meta(date, modelLabel, item.options?.glossary === true)}
        </div>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className='btn btn-ghost shrink-0 !px-3.5 !py-2 !text-caption'
          download
        >
          {c.download}
        </a>
      ) : (
        <button
          type='button'
          className='btn btn-ghost shrink-0 !px-3.5 !py-2 !text-caption'
          disabled
        >
          {c.expired}
        </button>
      )}
    </div>
  );
}

/**
 * 내 번역 — the signed-in user's credit balances and past translations.
 *
 * The 30-day promise lives here: `expired` items keep their row but lose the
 * button, whether or not the bytes still exist server-side.
 */
export default function MyPage() {
  const router = useRouter();
  const { user, credits, loading, signOut, refreshBalance } = useAuth();
  /** null = still fetching; [] = fetched and genuinely empty. */
  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchHistory().then((items) => {
      if (active) setHistory(items);
    });
    return () => {
      active = false;
    };
  }, [user]);

  // While the session resolves (or the redirect is in flight) show nothing —
  // don't flash a signed-in screen at an anonymous visitor.
  if (loading || !user) return null;

  return (
    <div>
      <div className='page-fold'>
        <AppNav
          credits={credits}
          onHome={() => router.push('/')}
        />

        <main className='w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-14 flex-1'>
          <div className='animate-zslide max-w-[720px] mx-auto'>
            <div className='head mb-8'>
              <h1>{c.title}</h1>
            </div>

            <p className='qlabel'>{c.creditsTitle}</p>
            {credits?.unlimitedUntil !== undefined ? (
              <UnlimitedCreditCard until={credits.unlimitedUntil} />
            ) : (
              <div className='grid grid-cols-2 gap-[14px]'>
                <CreditCard label={c.liteCredits} count={credits?.lite ?? 0} />
                <CreditCard label={c.proCredits} count={credits?.pro ?? 0} />
              </div>
            )}

            <p className='text-caption-sm text-secondary mt-3 mb-3'>
              {c.retention(RESULT_RETENTION_DAYS)}
            </p>

            <div className='mb-7'>
              <CouponRedeemCard onRedeemed={refreshBalance} />
            </div>

            <p className='qlabel'>{c.historyTitle}</p>

            {history === null ? (
              <p className='text-caption text-secondary py-6 text-center'>
                {COPY.auth.loading}
              </p>
            ) : history.length === 0 ? (
              <p className='text-caption text-secondary py-6 text-center'>{c.empty}</p>
            ) : (
              <div className='flex flex-col gap-2.5'>
                {history.map((item) => (
                  <HistoryRow key={item.jobId} item={item} />
                ))}
              </div>
            )}

            <button
              type='button'
              className='btn btn-primary btn-block mt-7'
              onClick={() => router.push('/')}
            >
              {c.again}
            </button>

            <button
              type='button'
              className='btn btn-ghost btn-block mt-2.5'
              onClick={signOut}
            >
              {c.signOut}
            </button>
          </div>
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
