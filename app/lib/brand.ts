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
  // ⚠️ **80자 이내로 유지할 것.** 네이버 웹페이지 최적화 진단이 그 이상을
  // 경고한다(2026-08-21 실측: 종전 101자 문구가 `페이지 설명`·`Open Graph
  // 설명` 두 항목에서 동시에 걸렸다). 두 항목이 함께 걸리는 이유는 이 한
  // 문자열이 `metadata.description`과 og/twitter 설명을 전부 먹이기
  // 때문이다 — 여기만 고치면 셋이 같이 고쳐진다. `app/seo.test.ts`가 길이를
  // 못 박는다(주석만으로는 다음 사람이 늘리는 걸 못 막는다).
  //
  // 종전 문구는 포맷 나열(SRT·VTT·SMI·ASS)과 다운로드 형식까지 담았는데,
  // 검색 결과에서 잘려나가는 뒷부분이라 아무도 읽지 않았다. 대표 결정으로
  // 혜택 중심으로 다시 썼다(40자).
  //
  // 여전히 도착어 개수는 주장하지 않는다 — `languages.ts`의 TARGET_LANGS는
  // 7개가 켜져 있지만 위저드에 setTargetLang을 물린 피커가 없어 실제로는
  // 전부 한국어로 나간다(CLAUDE.md: "도착어는 한국어만 활성"). 피커가
  // 나오면 그때 개수를 넣는다.
  description: '쉽고 빠른 자막 초벌 번역. 자연스러운 한국어 자막을 빠르게 완성하세요.',
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
