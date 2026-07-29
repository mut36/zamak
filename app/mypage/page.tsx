'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '../components/beta/AppNav';
import { useAuth } from '../hooks/useAuth';
import { fetchHistory } from '../lib/client/history';
import type { HistoryItem } from '../lib/jobHistory';
import { PRO_MODEL, RESULT_RETENTION_DAYS } from '../config/constants';
import { COPY } from '../i18n/simpleCopy';

const c = COPY.mypage;

function CreditCard({ label, count }: { label: string; count: number }) {
  return (
    <div className='card p-[18px]'>
      <div className='text-[13px] font-medium text-ink-3'>{label}</div>
      <div className='mt-1.5 flex items-baseline gap-1'>
        <span className='mono text-[28px] font-bold leading-none'>{count}</span>
        <span className='text-[13px] text-ink-3'>{c.unit}</span>
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
    <div className='card p-[14px_18px] flex items-center gap-3'>
      <div className='min-w-0 flex-1'>
        <div className='text-[14px] font-medium truncate'>{item.filename}</div>
        <div className='text-[12.5px] text-ink-3 mt-0.5'>
          {c.meta(date, modelLabel, item.options?.glossary === true)}
        </div>
      </div>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className='btn btn-ghost shrink-0 !px-3.5 !py-2 !text-[13px]'
          download
        >
          {c.download}
        </a>
      ) : (
        <button
          type='button'
          className='btn btn-ghost shrink-0 !px-3.5 !py-2 !text-[13px]'
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
  const { user, credits, loading } = useAuth();
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
    <div className='min-h-screen'>
      <AppNav credits={credits} onHome={() => router.push('/')} />

      <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
        <div className='animate-fade-slide-up'>
          <div className='head text-center mb-7'>
            <h1>{c.title}</h1>
          </div>

          <div className='grid grid-cols-2 gap-[14px]'>
            <CreditCard label={c.liteCredits} count={credits?.lite ?? 0} />
            <CreditCard label={c.proCredits} count={credits?.pro ?? 0} />
          </div>

          <p className='text-[12.5px] text-ink-3 mt-3 mb-7'>
            {c.retention(RESULT_RETENTION_DAYS)}
          </p>

          <h2 className='text-[15px] font-semibold mb-3'>{c.historyTitle}</h2>

          {history === null ? (
            <p className='text-[13px] text-ink-3 py-6 text-center'>
              {COPY.auth.loading}
            </p>
          ) : history.length === 0 ? (
            <p className='text-[13px] text-ink-3 py-6 text-center'>{c.empty}</p>
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
        </div>
      </main>
    </div>
  );
}
