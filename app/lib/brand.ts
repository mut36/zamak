/**
 * Brand colors for generated icons / OG images (ImageResponse can't read CSS vars).
 * Matches Simple theme tokens in globals.css.
 */
export const BRAND = {
  bg: '#FAF8F4',
  surface: '#FFFFFF',
  ink: '#3F3B35',
  ink2: '#7A746C',
  accent: '#3A9B72',
  accentSoft: '#E8F5EE',
  accentLine: '#A6D4BD',
} as const;

export const SITE = {
  name: 'ZAMAK',
  /** Canonical production origin (apex). www redirects here via vercel.json. */
  url: 'https://zamak.app',
  // Title focuses on the structural guarantee (timecode integrity), not speed.
  title: 'ZAMAK — 타임코드가 밀리지 않는 자막 번역기',
  // Description covers: formats, timecode safety, 7 target languages, no install.
  description:
    'SRT·VTT·SMI·ASS를 올리고, AI는 대사만 번역하며 코드가 타임코드를 다시 연결해 후속 자막의 연쇄 밀림을 막습니다. 결과는 SRT · 7개 도착어.',
  locale: 'ko_KR',
} as const;
