import Link from 'next/link';
import { BrandMark } from '../components/BrandMark';
import { COPY } from '../i18n/simpleCopy';

/**
 * Shared chrome for the two legal pages (/legal, /legal/privacy). They are
 * static server components on purpose: a regulator, a card acquirer, or a
 * rights holder has to be able to read them without signing in.
 */

export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='mt-10 scroll-mt-6' id={id}>
      <h2 className='text-body-lg font-bold text-ink-strong mb-3'>{title}</h2>
      <div className='text-caption text-nav leading-relaxed'>{children}</div>
    </section>
  );
}

/** Anchor list. Both pages are long enough that landing mid-document matters. */
export function Contents({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className='card p-5 mt-8'>
      <ul className='grid gap-1.5 sm:grid-cols-2 m-0 p-0 list-none'>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className='text-caption text-nav underline underline-offset-2'
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Callout for the one fact that answers most questions on either page. */
export function KeyPoint({ children }: { children: React.ReactNode }) {
  return (
    <div className='card p-5 mt-8 text-caption text-nav leading-relaxed'>
      {children}
    </div>
  );
}

export function LegalShell({
  title,
  subtitle,
  effectiveDate,
  otherDoc,
  children,
}: {
  title: string;
  subtitle: string;
  effectiveDate: string;
  otherDoc: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className='min-h-screen'>
      <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
        <Link href='/'>
          <BrandMark />
        </Link>
      </header>

      <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
        <div className='head'>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        {children}

        <p className='mt-10 text-caption-sm text-secondary'>시행일: {effectiveDate}</p>

        <p className='mt-6 flex items-center gap-2.5 text-caption text-secondary'>
          <Link href={otherDoc.href} className='underline'>
            {otherDoc.label}
          </Link>
          <span className='dot-sep' />
          <Link href='/' className='underline'>
            {COPY.legal.backHome}
          </Link>
        </p>
      </main>
    </div>
  );
}
