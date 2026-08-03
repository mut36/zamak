import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BRAND, SITE } from './lib/brand';

// Monospace for file names, timecodes, %, token counts, language codes.
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

function siteUrl(): URL {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL);
  }
  if (process.env.VERCEL_ENV === 'production') {
    return new URL(SITE.url);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL('http://localhost:3000');
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: SITE.title,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    'ZAMAK',
    '자막 번역',
    'SRT',
    'AI 번역',
    'Gemini',
    '자막 번역기',
  ],
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  // Was a hardcoded '#f5f5f7' — that number happened to already equal the
  // real page background (globals.css `--bg`), just not on purpose: `BRAND`
  // (this file's supposed mirror of that token) had drifted to a stale cream
  // color no longer used anywhere live (see lib/brand.ts's 2026-08-03 note).
  // Routing through BRAND.bg now means fixing the token in one place keeps
  // this in sync instead of being a second hardcoded copy that can re-drift.
  // No real dark theme exists (no site-wide prefers-color-scheme switch;
  // `colorScheme: 'light'` below tells the UA not to force one), so both
  // entries use the one real background.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.bg },
    { media: '(prefers-color-scheme: dark)', color: BRAND.bg },
  ],
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable must land on <html>, not <body>: `--mono` is declared
    // in `:root` and references it, and a custom property that references an
    // undefined one computes to guaranteed-invalid *there* — descendants then
    // inherit that emptiness, so every mono surface silently fell back to the
    // body sans.
    <html lang='ko' className={jetbrainsMono.variable}>
      <head>
        {/* Pretendard (dynamic-subset) — body/UI typeface */}
        <link
          rel='stylesheet'
          href='https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css'
        />
      </head>
      <body className='antialiased'>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
