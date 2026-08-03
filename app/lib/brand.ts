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
