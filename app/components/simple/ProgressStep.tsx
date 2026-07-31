'use client';

import type { TranslationProgress } from '../../types/translation';
import { StepBreadcrumb } from '../StepBreadcrumb';
import { COPY } from '../../i18n/simpleCopy';
import { DEFAULT_MODEL, estimateTranslationMs } from '../../config/constants';
import { overallPercent, stageViews, type StageKey } from '../../lib/progressStages';

interface ProgressStepProps {
  progress: TranslationProgress;
  /** Total subtitle blocks in the source (for the "N / total줄" readout). */
  totalLines: number;
  onCancel: () => void;
  /** Work identification (enrich / manual entry) is always settled before
   *  handleTranslate can even be called — see ProgressStep's own usage site
   *  for why this is passed as a constant rather than tracked state. */
  enrichDone: boolean;
  /** Whether the cast-sheet (glossary) toggle is on for this run. */
  glossaryEnabled: boolean;
  /** False only while the cast-sheet extraction is still in flight. */
  glossaryDone: boolean;
}

const c = COPY.progress;

/** Fallback title while every band is past its end (percent === 100) — the
 *  screen swaps to 'done' right after, so this is only ever visible for a
 *  frame. */
const FALLBACK_STAGE: StageKey = 'verify';

/**
 * Flat progress bar + 4-stage checklist (context → glossary → translate →
 * verify), driven entirely by `percent` — a single real number computed from
 * chunk-completion ratios (overallPercent), never from a client-side timer.
 * A bar that moves while nothing happens is a lie the user eventually
 * catches, so translation's 25–90% band is the only part that advances on
 * its own — everything else is a fast, real pass-through.
 */
export function ProgressStep({
  progress,
  totalLines,
  onCancel,
  enrichDone,
  glossaryEnabled,
  glossaryDone,
}: ProgressStepProps) {
  const percent = overallPercent(progress, {
    enrichDone,
    glossaryEnabled,
    glossaryDone,
  });
  const views = stageViews(percent, glossaryEnabled);
  const activeKey =
    views.find((v) => v.state === 'active')?.key ?? FALLBACK_STAGE;
  const title = c.stages[activeKey];

  const estimate =
    progress.totalEstimateMs || estimateTranslationMs(DEFAULT_MODEL);
  const remainingSec =
    percent >= 100
      ? 0
      : Math.max(1, Math.round((estimate * (1 - percent / 100)) / 1000));
  const processedLines = Math.round((percent / 100) * totalLines);

  return (
    <div className='animate-zslide flex flex-col items-center w-full max-w-[520px] mx-auto'>
      <StepBreadcrumb current='translate' className='mb-6' />
      <div className='head text-center'>
        <h1 className='!text-h1-mini'>{title}</h1>
      </div>

      <div className='mono text-fineprint text-tertiary mt-1'>
        {c.pct(percent, remainingSec)}
      </div>

      <div className='w-full h-[6px] rounded-full bg-track overflow-hidden mt-4 mb-4'>
        <div
          className='h-full rounded-full bg-ink-strong'
          style={{ width: `${percent}%`, transition: 'width 0.15s linear' }}
        />
      </div>

      <div className='card flex flex-col gap-[14px] w-full p-[24px_28px]'>
        {views.map((view) => (
          <div
            key={view.key}
            className={`flex items-center gap-3${
              view.state === 'skipped' || view.state === 'pending' ? ' opacity-40' : ''
            }`}
          >
            {view.state === 'done' ? (
              <span
                className='flex items-center justify-center w-5 h-5 rounded-[5px] text-white text-mono-step font-bold shrink-0'
                style={{ background: 'var(--success)' }}
              >
                ✓
              </span>
            ) : (
              <span
                className={`w-5 h-5 rounded-[5px] shrink-0${
                  view.state === 'active' ? ' animate-zbreathe' : ''
                }`}
                style={{
                  background: view.state === 'active' ? 'var(--ink-strong)' : 'transparent',
                  border: view.state === 'active' ? 'none' : '1.5px solid var(--border-step)',
                }}
              />
            )}
            <span className='text-body text-nav'>{c.stages[view.key]}</span>
            {view.state === 'skipped' && (
              <span className='ml-auto text-fineprint text-secondary'>
                {c.stageSkipped}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* While the sweep runs, the checklist is already pinned on "verify" —
          swap the readout for the one pair of numbers that is still moving,
          so the extra wait doesn't look like a hang. */}
      {progress.stage === 'recovering' ? (
        <div className='psub mono mt-4'>
          {c.recoveringDetail(progress.sweepRecovered, progress.sweepRemaining)}
        </div>
      ) : (
        totalLines > 0 && (
          <div className='psub mono mt-4'>
            {c.remaining(processedLines, totalLines, remainingSec)}
          </div>
        )
      )}

      <p className='text-caption text-nav text-center mt-6'>{c.reassure}</p>

      <button type='button' className='btn btn-ghost mt-5' onClick={onCancel}>
        {c.cancel}
      </button>
    </div>
  );
}
