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
  title: 'ZAMAK — 자막 번역기',
  description:
    '자막 파일을 올리면 약 2분 만에 AI 번역 자막을 받아보세요.',
  locale: 'ko_KR',
} as const;
