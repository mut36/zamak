'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Extra delay after the element enters the viewport (stagger cards). */
  delayMs?: number;
}

/**
 * Scroll-triggered fade/slide-in. Uses IntersectionObserver once; after the
 * element enters the viewport it stays visible. Honours prefers-reduced-motion
 * by skipping the hidden state entirely.
 */
export function Reveal({
  children,
  className = '',
  delayMs = 0,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-visible');
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.classList.add('is-visible');
        io.unobserve(el);
      },
      { threshold: 0.14, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined;

  return (
    <div
      ref={ref}
      className={['reveal', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}
