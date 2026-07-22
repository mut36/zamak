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

/** Where the linear phase hands off to the saturating one. */
const KNEE = 75;
/** The ceiling the estimate crawls toward; only a real result reaches 100. */
const CEIL = 99;

/**
 * Maps elapsed-time-as-percent onto what the ring shows.
 *
 * Linear while the estimate is holding, then saturating so an underestimate
 * degrades into a slow crawl instead of parking at 100% before the file
 * exists. The tail is scaled by exactly (CEIL - KNEE) so its slope at the
 * handoff is 1 — the previous curve divided by a constant instead, which
 * dropped the slope 4.4x in a single frame and read as a stall.
 */
function ease(raw: number): number {
  if (raw < KNEE) return raw;
  const span = CEIL - KNEE;
  return KNEE + span * (1 - Math.exp(-(raw - KNEE) / span));
}

/**
 * Elapsed-time estimate ring. The backend sends one final result rather than a
 * per-line stream, so the ring animates against the time estimate from
 * estimateTranslationMs() and eases toward — but never claims — 100% until the
 * result actually lands.
 *
 * The time animation runs even when there are several chunks, and the ring
 * shows whichever of the two is further along. Chunk completions alone move in
 * visible steps — one request per file means a single step from 0 to 100 — so
 * the estimate fills the gaps while chunk counts keep it honest.
 */
export function ProgressStep({ progress, totalLines, onCancel }: ProgressStepProps) {
  const [pct, setPct] = useState(0);
  const startRef = useRef(0);
  const estimate = progress.totalEstimateMs || 110_000;
  const done = progress.stage === 'finalizing' || progress.stage === 'done';

  useEffect(() => {
    if (done) return;
    if (startRef.current === 0) startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      setPct(Math.min(CEIL, ease((elapsed / estimate) * 100)));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [done, estimate]);

  const realPct =
    progress.totalChunks > 0
      ? (progress.currentChunk / progress.totalChunks) * 100
      : 0;
  // Never let the ring go backwards: a chunk landing early should pull it
  // forward, but a slow chunk must not undo what the estimate already showed.
  const displayPct = done ? 100 : Math.min(CEIL, Math.max(realPct, pct));
  const status =
    displayPct < 25 ? c.analyzing : displayPct < 92 ? c.translating : c.finalizing;
  const processed = Math.round((displayPct / 100) * totalLines);
  // Derive the countdown from whatever the ring is actually showing, so the
  // two never disagree — the chunk-based estimatedRemainingMs used to drive
  // this independently and could read 40s while the ring sat at 95%.
  const remainingSec = done
    ? 0
    : Math.max(1, Math.round((estimate * (1 - displayPct / 100)) / 1000));

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
