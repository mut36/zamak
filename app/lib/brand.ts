/**
 * Brand colors for generated icons / OG images (ImageResponse/Satori can't
 * read CSS vars, so this is a manual mirror of globals.css's `:root` tokens).
 *
 * ⚠️ Found stale 2026-08-03: this held an older cream/green palette (bg
 * #FAF8F4, accent #3A9B72) that predates the current brand
 * (`globals.css` "ZAMAK Design Tokens" header: "Black + yellow-point brand
 * ... No blue" — sourced from `design_handoff_zamak_brand`, same palette the
 * header wordmark (`public/brand/zamak-logo.png`) and the new favicon use).
 * Nothing had re-derived this file when the CSS tokens moved, so the OG/
 * Twitter share card and (until today) `apple-icon.tsx` were rendering in a
 * palette that doesn't exist anywhere else in the live product.
 *
 * ⚠️ **The `rgba()` entries are not safe inside a Satori gradient.** Satori
 * (the next/og renderer) drops the alpha channel on gradient color stops and
 * paints the stop fully opaque — measured 2026-08-03: an `--accent-wash`
 * (8% yellow) midpoint came out as rgb(255,211,14), i.e. neat #ffd400. The
 * old palette hid this because its `accentSoft` was an *opaque* pale green.
 * Pre-blend against the backdrop and use a hex literal there instead (see
 * `opengraph-image.tsx`'s WASH). Solid-fill and text colors are unaffected.
 */
export const BRAND = {
  bg: '#f5f5f7', // --bg
  surface: '#ffffff', // --surface
  ink: '#161614', // --ink-strong ("brand black" — logo, headline weight)
  ink2: '#6e6e73', // --text-secondary
  accent: '#ffd400', // --accent
  accentSoft: 'rgba(255, 212, 0, 0.45)', // --accent-soft
  accentLine: 'rgba(214, 176, 20, 0.6)', // --accent-line
} as const;

export const SITE = {
  name: 'ZAMAK',
  /** Canonical production origin (apex). www redirects here via vercel.json. */
  url: 'https://zamak.app',
  // Title focuses on the structural guarantee (timecode integrity), not speed.
  title: 'ZAMAK — 타임코드가 밀리지 않는 자막 번역기',
  // Description covers: formats, timecode safety, output. Deliberately
  // doesn't claim a target-language count — `languages.ts`'s TARGET_LANGS has
  // 7 enabled entries, but the wizard has no picker wired to setTargetLang,
  // so every job actually ships Korean today (CLAUDE.md: "도착어는 한국어만
  // 활성"). "7개 도착어" here would be a meta-description overclaim of
  // exactly the kind `docs/TODO.md`'s landing-copy audit already caught
  // elsewhere — this string just lives outside `simpleCopy.ts` so that sweep
  // never saw it. Revert to a count once the picker ships.
  description:
    'SRT·VTT·SMI·ASS를 올리고, AI는 대사만 한국어로 번역하며 코드가 타임코드를 다시 연결해 후속 자막의 연쇄 밀림을 막습니다. 다운로드는 SRT 또는 원본 형식(VTT).',
  locale: 'ko_KR',
} as const;

/**
 * The origin every absolute URL we emit is built from — `metadataBase`, the
 * sitemap's entries, and the sitemap reference in robots.txt.
 *
 * It lives here rather than in `layout.tsx` because those three must agree: a
 * sitemap listing `zamak.app` while robots.txt is served from a preview
 * deployment is the classic way to get a preview build indexed under the
 * production domain.
 *
 * Order matters. `NEXT_PUBLIC_SITE_URL` wins because it is the one value we
 * set on purpose; `VERCEL_ENV === 'production'` pins the apex so a production
 * build never falls through to a generated `*.vercel.app` host; the rest are
 * previews and local, where a wrong-but-reachable origin beats a right-but-
 * unreachable one.
 */
export function resolveSiteUrl(): URL {
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
