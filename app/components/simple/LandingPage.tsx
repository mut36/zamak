'use client';

import { useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';
import { BrandMark } from '../BrandMark';

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
    </div>
  );
}

/** One pane of the before/after sample, styled like a real .srt file. */
function SrtPane({
  label,
  accent,
  text,
}: {
  label: string;
  accent?: boolean;
  text: (b: (typeof c.sample.blocks)[number]) => string;
}) {
  return (
    <div className='min-w-0'>
      <div
        className={`text-[11.5px] font-bold uppercase tracking-[0.04em] mb-2 ${
          accent ? 'text-accent' : 'text-ink-3'
        }`}
      >
        {label}
      </div>
      <div className='bg-surface-2 border border-border rounded-sm p-4 overflow-x-auto'>
        {c.sample.blocks.map((b, i) => (
          <div key={b.no} className={i > 0 ? 'mt-4' : ''}>
            <div className='mono text-[11px] text-ink-3'>{b.no}</div>
            <div className='mono text-[11px] text-accent whitespace-nowrap'>
              {b.tc}
            </div>
            <div className='text-[13.5px] text-ink leading-snug mt-0.5'>
              {text(b)}
            </div>
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
 * with static content only (zero API cost). Lives at `/` for now; if routes
 * ever split, move this component behind a marketing route as-is.
 */
export function LandingPage({ onSignIn, error, configured }: LandingPageProps) {
  return (
    <div className='animate-fade-slide-up'>
      {(error || !configured) && (
        <div
          className='card p-4 mb-[14px] text-sm'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {configured ? error : COPY.auth.notConfigured}
        </div>
      )}

      {/* Hero */}
      <section className='text-center pt-8 pb-2'>
        <div className='head mb-7'>
          <h1>{c.hero.title}</h1>
          <p>{c.hero.subtitle}</p>
        </div>
        <GoogleCta onSignIn={onSignIn} configured={configured} />
        <div className='reassure'>
          {COPY.upload.reassure.map((item, i) => (
            <span key={item} className='flex items-center gap-2'>
              {i > 0 && <span className='dot-sep' />}
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Before / after sample */}
      <section className='mt-14'>
        <div className='head text-center mb-6'>
          <h1 className='text-[22px]'>{c.sample.title}</h1>
          <p>{c.sample.subtitle}</p>
        </div>
        <div className='card p-5'>
          <div className='grid gap-5 lg:grid-cols-2'>
            <SrtPane label={c.sample.srcLabel} text={(b) => b.src} />
            <SrtPane label={c.sample.dstLabel} accent text={(b) => b.dst} />
          </div>
        </div>
        <div className='grid gap-3 lg:grid-cols-2 mt-3'>
          {c.sample.points.map((p) => (
            <div key={p.title} className='card p-5'>
              <div className='dbadge mb-2'>
                <b />
                {p.title}
              </div>
              <p className='text-[13.5px] text-ink-2 leading-relaxed m-0'>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className='mt-14'>
        <div className='head text-center mb-6'>
          <h1 className='text-[22px]'>{c.how.title}</h1>
        </div>
        <div className='grid gap-3 lg:grid-cols-3'>
          {c.how.steps.map((s, i) => (
            <div key={s.title} className='card p-5 text-center'>
              <div className='step mx-auto mb-3 w-fit'>
                <span className='dot'>{i + 1}</span>
              </div>
              <div className='text-[15px] font-bold text-ink'>{s.title}</div>
              <p className='text-[13.5px] text-ink-2 mt-1 m-0'>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free credit + closing CTA */}
      <section className='mt-14'>
        <div className='card p-8 text-center'>
          <div className='head mb-5'>
            <h1 className='text-[22px]'>{c.closing.title}</h1>
            <p className='max-w-[480px] mx-auto'>{c.closing.body}</p>
          </div>
          <GoogleCta onSignIn={onSignIn} configured={configured} />
          <p className='text-[12px] text-ink-3 mt-4 m-0'>
            {COPY.auth.gateNote}
          </p>
        </div>
      </section>

      {/* Footer — legal / pricing links land here the day payments ship. */}
      <footer className='mt-14 pt-6 border-t border-border flex items-center justify-center gap-2.5 text-[12.5px] text-ink-3'>
        <BrandMark size={16} wordmarkSize={0} />
        <span className='font-bold text-ink-2'>{COPY.brand}</span>
        <span className='dot-sep' />
        <span>{c.footerNote}</span>
      </footer>
    </div>
  );
}
