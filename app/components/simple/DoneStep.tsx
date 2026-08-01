'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { CheckIcon, FileIcon, DownloadIcon } from '../icons';
import { downloadFile } from '../../utils/downloadFile';
import { buildReport, type ReportItem } from '../../lib/doneReport';
import { sendFeedback } from '../../lib/client/feedback';
import { recordEvent } from '../../lib/client/events';
import type { TranslationResult, MovieInfo } from '../../types/translation';
import type { CastSheet } from '../../types/glossary';
import { COPY } from '../../i18n/simpleCopy';

interface DoneStepProps {
  result: TranslationResult;
  movieInfo: MovieInfo;
  castSheet?: CastSheet;
  /** Owner for a feedback rating (see sendFeedback). Null when the run never
   *  got a job record — the feedback card has nowhere to attach, so it's
   *  omitted rather than shown disabled. */
  jobId: string | null;
  onStartOver: () => void;
}

const c = COPY.done;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/** Renders one ReportItem through its matching COPY.done.report.* function,
 *  spreading `params` in the order each function expects. */
function reportLine(item: ReportItem): string {
  const p = item.params ?? {};
  switch (item.key) {
    case 'timecode':
      return c.report.timecode(Number(p.lines), Number(p.fallback));
    case 'context':
      return c.report.context(String(p.context));
    case 'glossary':
      return c.report.glossary(Number(p.terms));
    case 'relations':
      return c.report.relations(Number(p.pairs));
  }
}

type FeedbackStatus = 'idle' | 'sending' | 'sent' | 'failed';

export function DoneStep({
  result,
  movieInfo,
  castSheet,
  jobId,
  onStartOver,
}: DoneStepProps) {
  const time = formatDuration(result.durationMs);
  const [primary, ...alternates] = result.downloads;
  const reportItems = buildReport(result, { movieInfo, castSheet });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>('idle');

  const handleSendFeedback = async () => {
    if (!jobId || rating === 0) return;
    setFeedbackStatus('sending');
    const ok = await sendFeedback(jobId, rating, comment);
    setFeedbackStatus(ok ? 'sent' : 'failed');
  };

  // Stagger indices keep the entrance order stable even when the warning /
  // feedback blocks are absent — download stays first after the hero.
  let section = 0;
  const nextSection = () => section++;

  return (
    <div className='done max-w-[680px] mx-auto'>
      <div className='done-hero text-center'>
        <div
          className='bigcheck done-check animate-zdonesuccess'
          style={{ background: 'var(--accent)', color: 'var(--ink-strong)' }}
        >
          <CheckIcon strokeWidth={3} />
        </div>
        <div className='head done-title'>
          <h1>{c.title}</h1>
          <p>{c.subtitle(result.lineCount, time)}</p>
        </div>
      </div>

      {/* Partial-failure notice — lines that were still original after the
          recovery sweep retried them, or a fatal error (quota/auth) that
          stopped the job early. failedChunks is deliberately not a trigger:
          a chunk the main pass lost is usually recovered block by block, so
          it says nothing about the file being downloaded. */}
      {result.stopReason || result.fallbackBlocks ? (
        <div
          className='card done-section p-4 mt-6 text-caption leading-relaxed'
          style={
            {
              '--done-i': nextSection(),
              color: 'oklch(0.5 0.13 75)',
              background: 'oklch(0.97 0.03 85)',
            } as CSSProperties
          }
        >
          {result.stopReason
            ? c.stopReason[result.stopReason]
            : c.partialWarning(result.fallbackBlocks ?? 0)}
        </div>
      ) : null}

      {/* Download card. A second button appears only when the uploaded format
          could be rebuilt — primary is that format, SRT is always the
          fallback, so there is never a state with no way to download. */}
      <div
        className='card dl-card done-section mt-6'
        style={{ '--done-i': nextSection() } as CSSProperties}
      >
        <div className='dl-file'>
          <FileIcon />
          <span className='nm'>{primary.filename}</span>
        </div>
        <button
          type='button'
          className='btn btn-primary btn-block'
          onClick={() => {
            downloadFile(primary.content, primary.filename, primary.mime);
            void recordEvent('download_clicked', { extension: primary.extension });
          }}
        >
          <DownloadIcon />
          {alternates.length > 0 ? c.downloadAs(primary.extension) : c.download}
        </button>
        {alternates.length > 0 && (
          <>
            <p className='mt-2 text-fineprint text-secondary'>
              {c.downloadAsHint(primary.extension)}
            </p>
            {alternates.map((option) => (
              <button
                key={option.extension}
                type='button'
                className='btn btn-ghost btn-block mt-1'
                onClick={() => {
                  downloadFile(option.content, option.filename, option.mime);
                  void recordEvent('download_clicked', { extension: option.extension });
                }}
              >
                {c.downloadAs(option.extension)}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Report card — only what we actually measured (see doneReport.ts). */}
      <div
        className='pvm done-section'
        style={{ '--done-i': nextSection() } as CSSProperties}
      >
        <div className='pvm-h'>{c.reportTitle}</div>
        {reportItems.map((item, i) => (
          <div
            className='pvm-row done-row'
            key={item.key}
            style={{ '--done-row-i': i } as CSSProperties}
          >
            <span className='check'>✓</span>
            <div className='t'>{reportLine(item)}</div>
          </div>
        ))}
      </div>

      {/* Feedback card — the beta's only quantitative quality signal. Omitted
          entirely when there is no job to attach the rating to. */}
      {jobId && (
        <div
          className='card done-section p-5 mt-4 text-center'
          style={{ '--done-i': nextSection() } as CSSProperties}
        >
          {feedbackStatus === 'sent' ? (
            <p className='text-body text-nav'>{c.feedbackThanks}</p>
          ) : (
            <>
              <div className='text-body font-semibold text-ink-strong mb-3'>{c.feedbackTitle}</div>
              <div className='feedback-stars' role='radiogroup' aria-label={c.feedbackTitle}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type='button'
                    className='star-btn'
                    aria-label={`${n}점`}
                    aria-pressed={rating >= n}
                    onClick={() => setRating(n)}
                  >
                    <span className={rating >= n ? 'on' : ''}>{rating >= n ? '★' : '☆'}</span>
                  </button>
                ))}
              </div>
              <input
                type='text'
                className='input'
                placeholder={c.feedbackPlaceholder}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {feedbackStatus === 'failed' && (
                <p className='mt-2 text-fineprint' style={{ color: 'oklch(0.5 0.13 75)' }}>
                  {c.feedbackFailed}
                </p>
              )}
              <button
                type='button'
                className='btn btn-ghost btn-block mt-3'
                disabled={rating === 0 || feedbackStatus === 'sending'}
                onClick={handleSendFeedback}
              >
                {c.feedbackSend}
              </button>
            </>
          )}
        </div>
      )}

      <div
        className='done-section done-actions mt-4'
        style={{ '--done-i': nextSection() } as CSSProperties}
      >
        <button type='button' className='btn btn-ghost' onClick={onStartOver}>
          {c.startOver}
        </button>
        <Link href='/mypage' className='btn btn-ghost'>
          {c.goHistory}
        </Link>
      </div>
    </div>
  );
}
