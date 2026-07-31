'use client';

import { useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.copyright;

interface CopyrightModalProps {
  onAgree: () => void;
  /** True while the consent record is being saved — locks the button so a
   *  double-click cannot fire recordConsent twice. */
  pending: boolean;
  /** Save-failure message ('' when none). The modal stays open on failure;
   *  proceeding on an unsaved consent would defeat its purpose. */
  error: string;
}

/**
 * Mandatory copyright-consent gate shown before the first translation.
 * Deliberately has no close/dismiss affordance: the only way through is to
 * check the box and agree (see the brief — this is a gate, not a dialog).
 */
export function CopyrightModal({ onAgree, pending, error }: CopyrightModalProps) {
  const [checked, setChecked] = useState(false);
  const canAgree = checked && !pending;

  return (
    <div className='animate-zscrim fixed inset-0 z-50 bg-scrim flex items-center justify-center px-6'>
      <div className='glass-modal w-full max-w-[460px] rounded-modal p-8 shadow-modal animate-zpop'>
        <h2 className='text-h2 text-ink-strong'>{c.title}</h2>
        <p className='mt-[10px] text-body text-secondary'>{c.body}</p>

        <button
          type='button'
          onClick={() => setChecked((v) => !v)}
          className='w-full flex items-center gap-2.5 mt-[18px] p-[12px_14px] rounded-drop text-left border border-border-chip bg-fill-hover/60 transition hover:bg-fill-hover'
        >
          <span
            className={`zcheck w-[22px] h-[22px] rounded-[6px] text-fineprint font-bold shrink-0${
              checked ? ' on' : ''
            }`}
          >
            {checked && '✓'}
          </span>
          <span className='text-caption text-nav'>{c.checkbox}</span>
        </button>

        {error && (
          <p className='mt-3 text-fineprint text-danger'>{error}</p>
        )}

        <button
          type='button'
          disabled={!canAgree}
          onClick={onAgree}
          // Same disabled treatment as WorkPickStep's confirm button: a flat
          // ink-disabled fill (not .btn's opacity fade) so the locked state
          // reads as "not yet", not "broken".
          className='w-full mt-[18px] text-white text-title-sm py-[13px] rounded-btn text-center transition active:scale-[0.98] disabled:cursor-default'
          style={{ background: canAgree ? 'var(--ink-strong)' : 'var(--ink-disabled)' }}
        >
          {c.agree}
        </button>
      </div>
    </div>
  );
}
