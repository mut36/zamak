'use client';

import { useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.copyright;

/** 새 탭으로 여는 이유: 이 모달은 첫 번역을 막고 선 게이트라, 같은 탭에서
 *  약관으로 나가면 돌아왔을 때 위저드 상태(읽어둔 파일·검색된 작품)가 통째로
 *  날아간다. */
const DOCS = [
  { href: COPY.legal.termsHref, label: COPY.legal.terms },
  { href: COPY.legal.privacyHref, label: COPY.legal.privacy },
];

function ExternalIcon() {
  return (
    <svg
      viewBox='0 0 24 24'
      width='12'
      height='12'
      fill='none'
      stroke='currentColor'
      strokeWidth='2.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
    >
      <path d='M7 17L17 7M17 7H7M17 7V17' />
    </svg>
  );
}

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
 * Mandatory consent gate shown before the first translation.
 * Deliberately has no close/dismiss affordance: the only way through is to
 * check the box and agree (see the brief — this is a gate, not a dialog).
 *
 * It carries the terms and the privacy policy as well as the copyright notice.
 * That is not decoration: the two always-on notices the landing and upload
 * screens used to hold were dropped in the 2026-08-02 redesign, leaving only a
 * footer link, and a checked box recorded with a version in
 * `copyright_consents` is stronger evidence than either of them was. See
 * COPY.copyright for the full reasoning.
 */
export function CopyrightModal({ onAgree, pending, error }: CopyrightModalProps) {
  const [checked, setChecked] = useState(false);
  const canAgree = checked && !pending;

  return (
    <div className='animate-zscrim fixed inset-0 z-50 bg-scrim flex items-center justify-center px-6'>
      <div className='bg-surface w-full max-w-[460px] rounded-modal p-8 shadow-modal animate-zpop'>
        <h2 className='text-h2 text-ink-strong'>{c.title}</h2>
        <div className='mt-[10px]'>
          <p className='text-body text-secondary'>{c.body}</p>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5'>
            <span className='text-fineprint text-tertiary'>{c.linksLabel}</span>
            {DOCS.map((doc) => (
              <a
                key={doc.href}
                href={doc.href}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 text-fineprint font-medium text-secondary hover:text-ink-strong transition-colors underline underline-offset-2'
              >
                {doc.label}
                <ExternalIcon />
              </a>
            ))}
          </div>
        </div>

        <button
          type='button'
          onClick={() => setChecked((v) => !v)}
          className='w-full flex items-center gap-2.5 mt-[18px] p-[12px_14px] rounded-drop text-left border border-border-chip bg-fill-hover/60 transition hover:bg-fill-hover'
        >
          <span
            className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-fineprint font-bold shrink-0 border-[1.5px] transition-colors ${
              checked
                ? 'bg-success border-success text-white'
                : 'bg-surface border-[rgba(0,0,0,0.22)] text-ink-strong'
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
