// ============================================================
// Target languages
// One table, three consumers: the picker (label/mono/enabled),
// the prompt (promptLabel/lineMaxChars/formality) and the
// post-processing pass (trailingPunctuation + shapes[profile]).
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

/**
 * How fast a viewer reads depends on what they're watching, not only on the
 * language: a variety clip's on-screen banter is skimmed, a documentary's
 * narration is read. So reading speed has two axes — the language (a Hangul
 * line carries far more meaning per character than a Latin one) and the
 * content profile below. Line length has only one axis, the language: see
 * `lineMaxChars`. This key is the same value as `ContentType`
 * (app/types/translation.ts): the picker on the upload screen chooses both the
 * info-gathering branch and the reading-speed band at once. Documentaries ride
 * along with `movie` — they read like film, and a fourth card would make the
 * upload screen a quiz.
 */
export type ContentProfileKey = 'movie' | 'variety' | 'talk';

export const CONTENT_PROFILE_KEYS: ContentProfileKey[] = [
  'movie',
  'variety',
  'talk',
];

/** Default when a caller has no profile (older clients, direct API calls). */
export const DEFAULT_CONTENT_PROFILE: ContentProfileKey = 'movie';

export function isContentProfileKey(value: unknown): value is ContentProfileKey {
  return (
    typeof value === 'string' &&
    (CONTENT_PROFILE_KEYS as string[]).includes(value)
  );
}

/** The reading-speed band one profile decides. */
export interface SubtitleShape {
  /**
   * Reading speed (characters per second) a widened block aims for — the
   * landing page's "권장 읽기 속도" and what `adjustSubtitleTiming` pulls a
   * too-fast block down to.
   */
  target: number;
  /**
   * Ceiling: only blocks reading faster than this are touched at all. Kept two
   * above `target` so a fixed block lands with margin rather than right back
   * on the trigger line.
   */
  hardMax: number;
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
   * far more meaning per character than Latin ones, hence ~25 vs ~42. This is
   * deliberately **not** part of the content profile: a shorter line changes
   * the translation itself (more splitting and compression), where the profile
   * is only meant to change how long a finished line stays on screen.
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
   * How a finished subtitle spells an ellipsis.
   *
   * Korean ships `...` by product decision (2026-08-18). This departs from the
   * reference guide, which asks for the single U+2026 glyph
   * (`docs/standards/netflix-korean-subtitles.md` §I.4) — the departure is
   * deliberate and recorded in `docs/decisions.md`, so a future reader finds
   * the reason instead of "fixing" it back. Every other target keeps `…`.
   *
   * enforceTextRules normalizes to `…` internally regardless, and only spells
   * it this way as the last step (via `TextRuleOptions.ellipsis`): a line
   * ending in `...` would otherwise lose a dot to the trailing-period strip.
   */
  ellipsis: '…' | '...';
  /**
   * Reading-speed band per content profile. See docs/tuning/reading-speed.md —
   * Korean is measured, the rest are derived from public style guides and want
   * re-measuring, so they use one shape for all three profiles until someone
   * measures them.
   */
  shapes: Record<ContentProfileKey, SubtitleShape>;
}

/** One band for all three profiles — for languages nobody has tuned yet. */
function uniformShapes(shape: SubtitleShape): Record<ContentProfileKey, SubtitleShape> {
  return { movie: shape, variety: shape, talk: shape };
}

const LATIN_SHAPE: SubtitleShape = { target: 17, hardMax: 20 };
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
    ellipsis: '...',
    // 유도는 docs/tuning/reading-speed.md §3. 예능이 가장 느긋하고(화면에 이미
    // 읽을 것이 많다), 강연·토크가 가장 촘촘하다(말이 끊이지 않아 노출을 넓히면
    // 다음 대사를 밀어낸다). 영화는 프로필 도입 전의 한국어 밴드 그대로 —
    // 상한 12 = Netflix 한국어 성인 상한, 다큐멘터리도 이 프로필에 들어간다.
    shapes: {
      movie: { target: 10, hardMax: 12 },
      variety: { target: 8, hardMax: 11 },
      talk: { target: 12, hardMax: 15 },
    },
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
    ellipsis: '…',
    shapes: uniformShapes(LATIN_SHAPE),
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
    ellipsis: '…',
    shapes: uniformShapes({ target: 8, hardMax: 9 }),
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
    ellipsis: '…',
    shapes: uniformShapes(LATIN_SHAPE),
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
    ellipsis: '…',
    shapes: uniformShapes(LATIN_SHAPE),
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
    ellipsis: '…',
    shapes: uniformShapes({ target: 8, hardMax: 9 }),
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
    ellipsis: '…',
    shapes: uniformShapes(LATIN_SHAPE),
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

/**
 * The one place the two axes meet. An unknown profile resolves to the default
 * rather than throwing: a shape is needed on paths (older clients, direct API
 * calls) where refusing to render a subtitle at all would be worse than
 * rendering it as a film.
 */
export function resolveSubtitleShape(
  code: string,
  profile?: ContentProfileKey | string,
): SubtitleShape {
  const shapes = resolveTargetLang(code).shapes;
  return shapes[isContentProfileKey(profile) ? profile : DEFAULT_CONTENT_PROFILE];
}
