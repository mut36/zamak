'use client';

import { useEffect, useRef, useState } from 'react';
import type { TranslationProgress } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface ProgressStepProps {
  progress: TranslationProgress;
  /** Total subtitle blocks in the source (for the "N / total줄" readout). */
  totalLines: number;
  onCancel: () => void;
}

const R = 78;
const CIRC = 2 * Math.PI * R;
const c = COPY.progress;

/**
 * Elapsed-time estimate ring. The backend currently sends one final result
 * (no per-line stream), so the ring animates against the time estimate and
 * eases toward — but never claims — 100% until the result actually lands.
 * When real chunk streaming is wired later, this can bind to true progress.
 */
export function ProgressStep({ progress, totalLines, onCancel }: ProgressStepProps) {
  const [pct, setPct] = useState(0);
  const startRef = useRef(0);
  const estimate = progress.totalEstimateMs || 110_000;
  const done = progress.stage === 'finalizing' || progress.stage === 'done';
  // With multiple chunks we have real progress; a single request has none, so
  // fall back to a smooth time-based estimate.
  const chunked = progress.totalChunks > 1;

  useEffect(() => {
    // Time-estimate animation only for the single-request case.
    if (done || chunked) return;
    if (startRef.current === 0) startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const raw = (elapsed / estimate) * 100;
      // Linear until 90%, then asymptotic crawl toward ~99%.
      const eased =
        raw < 90 ? raw : 90 + 9 * (1 - Math.exp(-(raw - 90) / 40));
      setPct(Math.min(99, eased));
    };
    tick();
    const id = window.setInterval(tick, 150);
    return () => window.clearInterval(id);
  }, [done, chunked, estimate]);

  const realPct =
    progress.totalChunks > 0
      ? (progress.currentChunk / progress.totalChunks) * 100
      : 0;
  const displayPct = done ? 100 : chunked ? realPct : pct;
  const status =
    displayPct < 25 ? c.analyzing : displayPct < 92 ? c.translating : c.finalizing;
  const processed = Math.round((displayPct / 100) * totalLines);
  const remainingSec = done
    ? 0
    : chunked
      ? Math.max(1, Math.round(progress.estimatedRemainingMs / 1000))
      : Math.max(1, Math.round((estimate - (estimate * displayPct) / 100) / 1000));

  return (
    <div className='animate-fade-slide-up flex flex-col items-center'>
      <div className='ring-wrap'>
        <div className='pring'>
          <svg width='172' height='172'>
            <circle
              cx='86'
              cy='86'
              r={R}
              fill='none'
              stroke='var(--surface-2)'
              strokeWidth='11'
            />
            <circle
              cx='86'
              cy='86'
              r={R}
              fill='none'
              stroke='var(--accent)'
              strokeWidth='11'
              strokeLinecap='round'
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - displayPct / 100)}
              style={{ transition: 'stroke-dashoffset 0.3s ease' }}
            />
          </svg>
          <div className='pcttext'>
            <span className='pn mono'>{Math.round(displayPct)}%</span>
            <span className='pl'>{c.label}</span>
          </div>
        </div>
      </div>

      <div className='pstatus'>{status}</div>
      {totalLines > 0 && (
        <div className='psub mono'>
          {c.remaining(processed, totalLines, remainingSec)}
        </div>
      )}

      <p className='text-[13px] text-ink-2 text-center mt-6'>{c.reassure}</p>

      <button type='button' className='btn btn-ghost mt-5' onClick={onCancel}>
        {c.cancel}
      </button>
    </div>
  );
}
