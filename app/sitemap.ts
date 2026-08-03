import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from './lib/brand';

/**
 * Every publicly meaningful page, which during the beta is three.
 *
 * The list is written out rather than derived from the filesystem on purpose:
 * most routes under `app/` are exactly the ones that must NOT be here
 * (`/mypage` is session-gated, `/dev/*` are prototypes, `/api/*` are not
 * pages). An explicit list cannot accidentally start advertising a route
 * somebody adds later — adding a page to the sitemap should be a decision, not
 * a side effect.
 *
 * `lastModified` is intentionally absent. We have no build-time source of
 * truth for when a page's content actually changed, and stamping `new Date()`
 * would tell crawlers all three pages change on every deploy — a claim that is
 * false and, once noticed, makes the whole file less trusted. Google treats
 * the field as a hint it may ignore; an absent hint beats a wrong one.
 *
 * `changeFrequency` is omitted for the same reason (and Google ignores it).
 * `priority` is only meaningful as a relative ordering within this file, which
 * is why the legal pages sit below the landing page rather than at a number
 * chosen to mean anything on its own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveSiteUrl();
  const url = (path: string) => new URL(path, base).toString();

  return [
    { url: url('/'), priority: 1 },
    { url: url('/legal'), priority: 0.3 },
    { url: url('/legal/privacy'), priority: 0.3 },
  ];
}
