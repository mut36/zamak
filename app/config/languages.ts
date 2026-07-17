// ============================================================
// Target languages
// Korean only for now; the rest are scaffolded and marked
// `enabled: false` so adding a language later = flip a flag.
// The source language is auto-detected by the model, so it is
// intentionally not modeled here.
// ============================================================

export interface TargetLang {
  /** Passed to the translation API + used for the output file suffix. */
  code: string;
  /** Human label shown in the picker. */
  label: string;
  /** Two-letter code shown in JetBrains Mono. */
  mono: string;
  /** When false, rendered but not selectable (roadmap hint). */
  enabled: boolean;
}

export const TARGET_LANGS: TargetLang[] = [
  { code: 'ko', label: '한국어', mono: 'KO', enabled: true },
  { code: 'en', label: 'English', mono: 'EN', enabled: false },
  { code: 'ja', label: '日本語', mono: 'JA', enabled: false },
  { code: 'es', label: 'Español', mono: 'ES', enabled: false },
  { code: 'fr', label: 'Français', mono: 'FR', enabled: false },
  { code: 'zh', label: '中文', mono: 'ZH', enabled: false },
];

export const DEFAULT_TARGET_LANG = 'ko';

export function getTargetLang(code: string): TargetLang | undefined {
  return TARGET_LANGS.find((lang) => lang.code === code);
}
