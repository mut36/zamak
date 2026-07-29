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
    <div className='fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-5'>
      <div className='w-full max-w-[420px] bg-surface rounded-card-lg shadow-[var(--shadow-modal)] p-7 animate-fade-slide-up'>
        <h2 className='text-[19px] font-bold text-ink'>{c.title}</h2>
        <p className='mt-3 text-[14px] leading-relaxed text-ink-2'>{c.body}</p>

        <label className='flex items-start gap-2.5 mt-5 cursor-pointer'>
          <input
            type='checkbox'
            className='mt-[3px] w-4 h-4 accent-[var(--ink)]'
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span className='text-[13.5px] text-ink-2'>{c.checkbox}</span>
        </label>

        {error && (
          <p className='mt-3 text-[12px]' style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <button
          type='button'
          disabled={!canAgree}
          onClick={onAgree}
          // Same disabled treatment as WorkPickStep's confirm button: a flat
          // #c7c7cc fill (not .btn's opacity fade) so the locked state reads
          // as "not yet", not "broken".
          className='w-full mt-5 text-white text-[15px] font-bold py-[14px] rounded-[14px] transition active:scale-[0.98] disabled:cursor-default'
          style={{ background: canAgree ? 'var(--ink)' : '#c7c7cc' }}
        >
          {c.agree}
        </button>
      </div>
    </div>
  );
}
