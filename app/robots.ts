import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from './lib/brand';

/**
 * Crawling is OPEN during the beta (대표 결정 2026-08-03).
 *
 * The state this file replaces was neither open nor closed: `layout.tsx` said
 * `robots: { index: true }` while no robots.txt existed and no sitemap was
 * ever offered. That combination indexes whatever a crawler happens to walk
 * into, which is the one outcome nobody chose. The decision was to open
 * deliberately and start accruing index history now, with the sitemap
 * (`app/sitemap.ts`) naming exactly which pages count.
 *
 * The disallow list is not about secrecy — `/mypage` and the API already
 * require a session, and a crawler reaching them gets a 401 or a login screen.
 * It is about crawl budget and about what appears in a result page: a search
 * hit landing on a bare API route or an internal prototype is a broken first
 * impression, not a visit.
 *
 * ⚠️ Preview deployments serve this file too. What keeps a preview from being
 * indexed under the production domain is `resolveSiteUrl()`, which reports the
 * deployment's own origin unless `NEXT_PUBLIC_SITE_URL` says otherwise — so do
 * NOT set that variable on preview environments.
 */
export default function robots(): MetadataRoute.Robots {
  const base = resolveSiteUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        // Session-gated; nothing here renders for a crawler anyway.
        '/auth/',
        '/mypage',
        // Design prototypes. Already `notFound()` when NODE_ENV is production
        // (app/dev/preview/page.tsx, app/dev/prototype/route.ts), so this line
        // only matters on preview deployments — where they DO render.
        '/dev/',
      ],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
    host: base.host,
  };
}
