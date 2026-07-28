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
      // The OAuth redirect usually navigates away before this runs; it matters
      // only when the redirect fails to start.
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
      <p className='text-[12.5px] text-ink-3 text-center'>{c.hero.ctaHint}</p>
      {/* signup-wrap: binding the notice to the sign-in action holds up better
          than a footer link alone, without a modal's friction. */}
      <p className='text-[11.5px] text-ink-3 text-center max-w-[320px]'>
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

/** One pane of the before/after SRT sample — dark terminal style. */
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
          <div key={b.no} className={i > 0 ? 'mt-4' : ''}>
            <div className='srt-terminal-no'>{b.no}</div>
            <div className='srt-terminal-tc'>{b.tc}</div>
            <div className='srt-terminal-text'>{text(b)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  /** Server-side auth misconfiguration, or a failed OAuth round-trip. */
  error?: string;
  configured: boolean;
}

/**
 * What an anonymous visitor sees. Every model route is login-gated, so this
 * page's whole job is to give people a reason to press the sign-in button —
 * with static content only (zero API cost).
 *
 * Structure: Hero → SRT proof → 4 differentiators → 3-step how-to →
 *            product specs → closing CTA.
 * Accessibility: single h1, section landmarks with aria-labelledby,
 *                keyboard focus-visible, prefers-reduced-motion in globals.css.
 * Motion: hero appears immediately; below-the-fold blocks use scroll reveal.
 */
export function LandingPage({ onSignIn, error, configured }: LandingPageProps) {
  return (
    <div>
      {(error || !configured) && (
        <div
          className='card p-4 mb-3.5 text-sm'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {configured ? error : COPY.auth.notConfigured}
        </div>
      )}

      {/* ── Hero — always visible on first paint ──────────────────── */}
      <section
        aria-labelledby='hero-title'
        className='text-center pt-8 pb-2 animate-fade-slide-up'
      >
        <div className='mb-7'>
          <h1
            id='hero-title'
            className='text-3xl sm:text-4xl font-extrabold tracking-[-0.04em] text-ink mb-3 leading-tight text-balance'
          >
            {c.hero.title}
          </h1>
          <p className='text-[15px] sm:text-base text-ink-2 m-0 leading-relaxed max-w-130 mx-auto text-pretty'>
            {c.hero.subtitle}
          </p>
        </div>
        <GoogleCta onSignIn={onSignIn} configured={configured} />
        <div className='reassure mt-5'>
          {c.reassure.map((item, i) => (
            <span key={item} className='flex items-center gap-2'>
              {i > 0 && <span className='dot-sep' />}
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Before / After SRT ────────────────────────────────────── */}
      <section aria-labelledby='proof-title' className='mt-24 sm:mt-32'>
        <Reveal>
          <div className='head text-center mb-6'>
            <h2 id='proof-title'>{c.proof.title}</h2>
            <p>{c.proof.subtitle}</p>
          </div>
          <div className='card p-5'>
            <div className='grid gap-5 lg:grid-cols-2'>
              <SrtPane label={c.proof.srcLabel} text={(b) => b.src} />
              <SrtPane label={c.proof.dstLabel} accent text={(b) => b.dst} />
            </div>
            <p className='text-[12.5px] text-ink-3 leading-relaxed mt-4 mb-0'>
              {c.proof.note}
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── Differentiating features ──────────────────────────────── */}
      <section aria-labelledby='features-title' className='mt-24 sm:mt-32'>
        <Reveal>
          <div className='head text-center mb-6'>
            <h2 id='features-title'>{c.features.title}</h2>
          </div>
        </Reveal>
        <div className='grid gap-3 lg:grid-cols-2'>
          {c.features.items.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 70}>
              <div className='card p-5 h-full'>
                <div className='flex items-center gap-2 flex-wrap mb-2'>
                  <span className='text-[15px] font-bold text-ink'>
                    {f.title}
                  </span>
                  {'badge' in f && (
                    <span className='dbadge dbadge-inline'>
                      <b />
                      {(f as { badge: string }).badge}
                    </span>
                  )}
                </div>
                <p className='text-[13.5px] text-ink-2 leading-relaxed m-0'>
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────── */}
      <section aria-labelledby='steps-title' className='mt-24 sm:mt-32'>
        <Reveal>
          <div className='head text-center mb-6'>
            <h2 id='steps-title'>{c.how.title}</h2>
          </div>
        </Reveal>
        <div className='grid gap-3 lg:grid-cols-3'>
          {c.how.steps.map((s, i) => (
            <Reveal key={s.title} delayMs={i * 80}>
              <div className='card p-5 text-center h-full'>
                <div className='step mx-auto mb-3 w-fit'>
                  <span className='dot'>{i + 1}</span>
                </div>
                <div className='text-[15px] font-bold text-ink'>{s.title}</div>
                <p className='text-[13.5px] text-ink-2 mt-1 m-0'>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Product specs ─────────────────────────────────────────── */}
      <section aria-labelledby='specs-title' className='mt-24 sm:mt-32'>
        <Reveal>
          <div className='head text-center mb-6'>
            <h2 id='specs-title'>{c.specs.title}</h2>
          </div>
          <dl className='card overflow-hidden'>
            {c.specs.items.map((spec, i) => (
              <div
                key={spec.label}
                className={`flex items-baseline gap-4 px-5 py-3.5 flex-wrap${
                  i < c.specs.items.length - 1 ? ' border-b border-border' : ''
                }`}
              >
                <dt className='text-[13px] font-semibold text-ink-3 w-24 flex-none'>
                  {spec.label}
                </dt>
                <dd className='text-[13.5px] text-ink m-0 leading-snug flex-1'>
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* ── Closing CTA ───────────────────────────────────────────── */}
      <section aria-labelledby='closing-title' className='mt-24 sm:mt-32'>
        <Reveal>
          <div className='card p-8 text-center'>
            <div className='head mb-5'>
              <h2 id='closing-title'>{c.closing.title}</h2>
              <p className='max-w-120 mx-auto'>{c.closing.body}</p>
            </div>
            <GoogleCta onSignIn={onSignIn} configured={configured} />
            <p className='text-[12px] text-ink-3 mt-4 m-0'>
              {COPY.auth.gateNote}
            </p>
          </div>
        </Reveal>
      </section>

      <footer className='mt-24 sm:mt-32 pt-6 border-t border-border text-[12.5px] text-ink-3'>
        <Reveal>
          <div className='flex items-center justify-center gap-2.5 flex-wrap'>
            <BrandMark size={16} wordmarkSize={0} />
            <span className='font-bold text-ink-2'>{COPY.brand}</span>
            <span className='dot-sep' />
            <span>{c.footerNote}</span>
          </div>
          <div className='flex items-center justify-center gap-2.5 mt-2'>
            <Link href={COPY.legal.termsHref} className='underline'>
              {COPY.legal.terms}
            </Link>
            <span className='dot-sep' />
            <Link href={COPY.legal.privacyHref} className='underline'>
              {COPY.legal.privacy}
            </Link>
          </div>
        </Reveal>
      </footer>
    </div>
  );
}
