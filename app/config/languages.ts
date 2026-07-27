// ============================================================
// Target languages
// One table, three consumers: the picker (label/mono/enabled),
// the prompt (promptLabel/rulesKey/lineMaxChars/formality) and
// the post-processing pass (trailingPunctuation/reading).
// Adding a language = one row here + one prompts/common/
// translation_rules_<code>.txt file.
// The source language is auto-detected by the model, so it is
// intentionally not modeled here.
// ============================================================

export type TargetLangCode = 'ko' | 'en' | 'ja' | 'es' | 'fr' | 'zh' | 'de';

/**
 * Display names for a language's grammaticalized formality axis — the thing
 * `<speech_relations>` encodes ("A speaks to B in X"). Stored values are
 * language-neutral (`formal`/`informal`/`mixed`); these are what the model and
 * the user actually see, in the terms that language uses.
 *
 * `null` (English, Chinese) means the language has no such axis: the cast
 * sheet then carries terms only, and the `<speech_relations>` tag is never
 * built at all.
 */
export interface FormalityAxis {
  formal: string;
  informal: string;
  mixed: string;
}

export interface TargetLang {
  /** Passed to the translation API + used for the output file suffix. */
  code: TargetLangCode;
  /** Human label shown in the picker. */
  label: string;
  /** Two-letter code shown in JetBrains Mono. */
  mono: string;
  /** When false, rendered but not selectable (roadmap hint). */
  enabled: boolean;
  /** Korean name of the language, injected as the prompt's 목표 언어. */
  promptLabel: string;
  /**
   * Per-line character budget the model is asked to respect. CJK glyphs carry
   * far more meaning per character than Latin ones, hence ~25 vs ~42.
   */
  lineMaxChars: number;
  formality: FormalityAxis | null;
  /**
   * Sentence-final punctuation stripped from finished subtitles by
   * enforceTextRules. CJK subtitle convention omits it; Latin-script
   * subtitling keeps it, so those languages pass an empty string and the
   * strip step is skipped entirely.
   */
  trailingPunctuation: string;
  /**
   * Reading-speed band (characters per second) for adjustSubtitleTiming.
   * See docs/tuning/reading-speed.md — Korean is measured, the rest are
   * derived from public style guides and want re-measuring.
   */
  reading: { hardMax: number; target: number };
}

const LATIN_READING = { hardMax: 20, target: 17 };
/** usted/tú, Sie/du, vous/tu — same axis, different pronouns. */
const T_V_AXIS = (formal: string, informal: string): FormalityAxis => ({
  formal: `${formal}(격식)`,
  informal: `${informal}(비격식)`,
  mixed: '혼용',
});

export const TARGET_LANGS: TargetLang[] = [
  {
    code: 'ko',
    label: '한국어',
    mono: 'KO',
    enabled: true,
    promptLabel: '한국어',
    lineMaxChars: 25,
    formality: { formal: '존댓말', informal: '반말', mixed: '혼용' },
    trailingPunctuation: '.,',
    reading: { hardMax: 12, target: 10 },
  },
  {
    code: 'en',
    label: 'English',
    mono: 'EN',
    enabled: true,
    promptLabel: '영어',
    lineMaxChars: 42,
    formality: null,
    trailingPunctuation: '',
    reading: LATIN_READING,
  },
  {
    code: 'ja',
    label: '日本語',
    mono: 'JA',
    enabled: true,
    promptLabel: '일본어',
    lineMaxChars: 20,
    formality: {
      formal: '敬語(です・ます体)',
      informal: 'タメ口(常体)',
      mixed: '혼용',
    },
    trailingPunctuation: '.,。、',
    reading: { hardMax: 9, target: 8 },
  },
  {
    code: 'es',
    label: 'Español',
    mono: 'ES',
    enabled: true,
    promptLabel: '스페인어',
    lineMaxChars: 42,
    formality: T_V_AXIS('usted', 'tú'),
    trailingPunctuation: '',
    reading: LATIN_READING,
  },
  {
    code: 'fr',
    label: 'Français',
    mono: 'FR',
    enabled: true,
    promptLabel: '프랑스어',
    lineMaxChars: 42,
    formality: T_V_AXIS('vous', 'tu'),
    trailingPunctuation: '',
    reading: LATIN_READING,
  },
  {
    code: 'zh',
    label: '中文',
    mono: 'ZH',
    enabled: true,
    promptLabel: '중국어(간체)',
    lineMaxChars: 18,
    formality: null,
    trailingPunctuation: '.,。，',
    reading: { hardMax: 9, target: 8 },
  },
  {
    code: 'de',
    label: 'Deutsch',
    mono: 'DE',
    enabled: true,
    promptLabel: '독일어',
    lineMaxChars: 42,
    formality: T_V_AXIS('Sie', 'du'),
    trailingPunctuation: '',
    reading: LATIN_READING,
  },
];

export const DEFAULT_TARGET_LANG = 'ko';

export function getTargetLang(code: string): TargetLang | undefined {
  return TARGET_LANGS.find((lang) => lang.code === code);
}

/**
 * The one gate every server entry point uses: an unknown or not-yet-enabled
 * code must never reach the prompt builder, which would otherwise silently
 * fall back to some other language's rules.
 */
export function getEnabledTargetLang(code: string): TargetLang | undefined {
  const lang = getTargetLang(code);
  return lang?.enabled ? lang : undefined;
}

/** Fallback-safe lookup for display paths that must render something. */
export function resolveTargetLang(code: string): TargetLang {
  return getEnabledTargetLang(code) ?? TARGET_LANGS[0];
}
