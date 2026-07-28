'use client';

import { useState } from 'react';
import Link from 'next/link';
import { COPY } from '../../i18n/simpleCopy';
import { BrandMark } from '../BrandMark';
import { Reveal } from './Reveal';

const c = COPY.landing;

/** Google's mark, inlined so the sign-in button needs no external asset. */
function GoogleIcon() {
  return (
    <svg width='18' height='18' viewBox='0 0 18 18' aria-hidden='true'>
      <path
        fill='#4285F4'
        d='M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z'
      />
      <path
        fill='#34A853'
        d='M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z'
      />
      <path
        fill='#FBBC05'
        d='M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z'
      />
      <path
        fill='#EA4335'
        d='M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z'
      />
    </svg>
  );
}

function GoogleCta({
  onSignIn,
  configured,
}: {
  onSignIn: () => Promise<void>;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col items-center gap-3'>
      <button
        type='button'
        className='btn btn-primary btn-lg flex items-center justify-center gap-2.5'
        disabled={busy || !configured}
        onClick={handleClick}
      >
        <GoogleIcon />
        {busy ? COPY.auth.signingIn : c.hero.cta}
      </button>
      <p className='text-[13px] text-ink-3 text-center m-0'>{c.hero.ctaHint}</p>
      <p className='text-[12px] text-ink-3 text-center max-w-[340px] m-0'>
        {COPY.legal.consentPrefix}
        <Link href={COPY.legal.termsHref} className='underline'>
          {COPY.legal.terms}
        </Link>
        {COPY.legal.consentAnd}
        <Link href={COPY.legal.privacyHref} className='underline'>
          {COPY.legal.privacy}
        </Link>
        {COPY.legal.consentSuffix}
      </p>
    </div>
  );
}

function SrtPane({
  label,
  accent,
  text,
}: {
  label: string;
  accent?: boolean;
  text: (b: (typeof c.proof.blocks)[number]) => string;
}) {
  return (
    <div className='min-w-0'>
      <div className={`srt-terminal-label${accent ? ' accent' : ''}`}>
        {label}
      </div>
      <div className='srt-terminal'>
        {c.proof.blocks.map((b, i) => (
          <div key={b.no} className={i > 0 ? 'mt-5' : ''}>
            <div className='srt-terminal-no'>{b.no}</div>
            <div className='srt-terminal-tc'>{b.tc}</div>
            <div className='srt-terminal-text'>{text(b)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChapterTitle({
  id,
  eyebrow,
  title,
  badge,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  badge?: string;
}) {
  return (
    <div className='landing-chapter-head'>
      {eyebrow && (
        <p className='landing-eyebrow'>
          {eyebrow}
          {badge && (
            <span className='dbadge dbadge-inline ml-2'>
              <b />
              {badge}
            </span>
          )}
        </p>
      )}
      <h2 id={id} className='landing-title'>
        {title}
      </h2>
    </div>
  );
}

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  error?: string;
  configured: boolean;
}

/**
 * Marketing landing for anonymous visitors — Toss-like full-bleed chapters:
 * one idea per section, large type, generous whitespace. Auth CTA only;
 * zero API cost. Signed-in wizard stays on the tighter content column.
 */
export function LandingPage({ onSignIn, error, configured }: LandingPageProps) {
  return (
    <div className='landing'>
      {(error || !configured) && (
        <div className='landing-inner pt-4'>
          <div
            className='card p-4 text-sm'
            style={{ color: 'oklch(0.55 0.2 25)' }}
          >
            {configured ? error : COPY.auth.notConfigured}
          </div>
        </div>
      )}

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section
        aria-labelledby='hero-title'
        className='landing-hero animate-fade-slide-up'
      >
        <div className='landing-inner text-center'>
          <h1 id='hero-title' className='landing-hero-title'>
            {c.hero.title}
          </h1>
          <p className='landing-hero-sub'>{c.hero.subtitle}</p>
          <div className='mt-10'>
            <GoogleCta onSignIn={onSignIn} configured={configured} />
          </div>
          <ul className='landing-reassure'>
            {c.reassure.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Proof / SRT ───────────────────────────────────────────── */}
      <section
        aria-labelledby='proof-title'
        className='landing-band landing-band-soft'
      >
        <Reveal className='landing-inner'>
          <ChapterTitle
            id='proof-title'
            eyebrow={c.proof.eyebrow}
            title={c.proof.title}
          />
          <p className='landing-body'>{c.proof.subtitle}</p>
          <div className='landing-proof-grid'>
            <SrtPane label={c.proof.srcLabel} text={(b) => b.src} />
            <SrtPane label={c.proof.dstLabel} accent text={(b) => b.dst} />
          </div>
          <p className='landing-note'>{c.proof.note}</p>
        </Reveal>
      </section>

      {/* ── Feature chapters (one idea each) ──────────────────────── */}
      {c.features.items.map((f, i) => (
        <section
          key={f.eyebrow}
          aria-labelledby={`feature-${i}-title`}
          className={
            i % 2 === 1
              ? 'landing-band landing-band-soft'
              : 'landing-band'
          }
        >
          <Reveal className='landing-inner landing-inner-narrow'>
            <ChapterTitle
              id={`feature-${i}-title`}
              eyebrow={f.eyebrow}
              title={f.title}
              badge={'badge' in f ? (f as { badge: string }).badge : undefined}
            />
            <p className='landing-body'>{f.body}</p>
          </Reveal>
        </section>
      ))}

      {/* ── How it works ──────────────────────────────────────────── */}
      <section
        aria-labelledby='steps-title'
        className='landing-band landing-band-soft'
      >
        <Reveal className='landing-inner'>
          <ChapterTitle
            id='steps-title'
            eyebrow={c.how.eyebrow}
            title={c.how.title}
          />
          <ol className='landing-steps'>
            {c.how.steps.map((s, i) => (
              <li key={s.title} className='landing-step'>
                <span className='landing-step-num' aria-hidden='true'>
                  {i + 1}
                </span>
                <div>
                  <div className='landing-step-title'>{s.title}</div>
                  <p className='landing-step-body'>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* ── Specs ─────────────────────────────────────────────────── */}
      <section aria-labelledby='specs-title' className='landing-band'>
        <Reveal className='landing-inner'>
          <ChapterTitle
            id='specs-title'
            eyebrow={c.specs.eyebrow}
            title={c.specs.title}
          />
          <dl className='landing-specs'>
            {c.specs.items.map((spec) => (
              <div key={spec.label} className='landing-spec'>
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────── */}
      <section
        aria-labelledby='closing-title'
        className='landing-band landing-band-accent'
      >
        <Reveal className='landing-inner text-center'>
          <h2 id='closing-title' className='landing-title landing-title-center'>
            {c.closing.title}
          </h2>
          <p className='landing-body landing-body-center'>{c.closing.body}</p>
          <div className='mt-10'>
            <GoogleCta onSignIn={onSignIn} configured={configured} />
          </div>
          <p className='text-[13px] text-ink-3 mt-5 m-0'>
            {COPY.auth.gateNote}
          </p>
        </Reveal>
      </section>

      <footer className='landing-footer'>
        <div className='landing-inner'>
          <div className='flex items-center justify-center gap-2.5 flex-wrap text-[13px] text-ink-3'>
            <BrandMark size={16} wordmarkSize={0} />
            <span className='font-bold text-ink-2'>{COPY.brand}</span>
            <span className='dot-sep' />
            <span>{c.footerNote}</span>
          </div>
          <div className='flex items-center justify-center gap-2.5 mt-3 text-[13px] text-ink-3'>
            <Link href={COPY.legal.termsHref} className='underline'>
              {COPY.legal.terms}
            </Link>
            <span className='dot-sep' />
            <Link href={COPY.legal.privacyHref} className='underline'>
              {COPY.legal.privacy}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
