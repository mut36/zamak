// ============================================================
// Target languages
// One table, three consumers: the picker (label/mono/enabled),
// the prompt (promptLabel/lineMaxChars/formality) and the
// post-processing pass (trailingPunctuation + shapes[profile]).
// Adding a language = one row here + one prompts/common/
// translation_rules_<code>.txt file (번역 도착어로 열 때).
// 규칙 적용(/polish)은 축이 따로다 — `polish` 플래그 + line_split_/
// dialogue_merge_/fragment_join_<code>.txt 세 개.
// The source language is auto-detected by the model, so it is
// intentionally not modeled here.
// ============================================================

export type TargetLangCode =
  | 'ko'
  | 'en'
  | 'ja'
  | 'es'
  | 'fr'
  | 'zh'
  | 'de'
  | 'it';

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
  /**
   * 규칙 적용(`/polish`)이 이 언어를 다룰 수 있는가 — **번역 도착어와 다른 축**이다.
   *
   * 두 경로가 필요로 하는 것이 다르다. 번역은 `translation_rules_<code>.txt`
   * 하나면 되고, 규칙 적용은 줄바꿈·합치기·잇기 프롬프트 셋이 있어야 한다.
   * 한 플래그로 묶으면 둘 중 하나만 준비된 언어를 표현할 수 없고, 실제로
   * 그런 언어가 양쪽에 다 있다 — 영어는 번역만 되고, 이탈리아어는 규칙
   * 적용만 된다(2026-08-26).
   *
   * 이 값이 false인 언어로 `/api/polish`를 부르면 400으로 거절한다. 예전에는
   * 프롬프트 파일이 없어 500으로 터졌다 — 같은 사실이지만 원인이 안 보였다.
   */
  polish: boolean;
  /** Korean name of the language, injected as the prompt's 목표 언어. */
  promptLabel: string;
  /**
   * Per-line character budget, in visible characters (spaces and punctuation
   * count; markup does not). CJK glyphs carry far more meaning per character
   * than Latin ones, hence ~18 vs ~42. This is deliberately **not** part of
   * the content profile: a shorter line changes the translation itself (more
   * splitting and compression), where the profile is only meant to change how
   * long a finished line stays on screen.
   *
   * Two consumers, one number. The prompt renders it as the hard trigger
   * ("넘으면 반드시 `|`로 나눠"), and enforceTextRules measures the same budget
   * when folding a gratuitously split block back onto one line — so a fold can
   * never produce a line the prompt would have had to split. Korean pairs it
   * with a softer 16-char recommendation that lives only in the prompt
   * (`translation_rules_ko.txt` 규칙 2); see decisions.md §2-6.
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
   * Every target currently ships the single U+2026 glyph `…`, per the
   * reference guide (`docs/standards/netflix-korean-subtitles.md` §I.4).
   * Korean briefly shipped `...` instead; that was reversed the same day
   * (`docs/decisions.md` §6-13), so the axis is here and live but no language
   * uses the other value yet.
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
    polish: true,
    promptLabel: '한국어',
    lineMaxChars: 18,
    formality: { formal: '존댓말', informal: '반말', mixed: '혼용' },
    trailingPunctuation: '.,',
    ellipsis: '…',
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
    polish: false,
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
    polish: false,
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
    polish: false,
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
    polish: false,
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
    polish: false,
    promptLabel: '중국어(간체)',
    lineMaxChars: 18,
    formality: null,
    trailingPunctuation: '.,。，',
    ellipsis: '…',
    shapes: uniformShapes({ target: 8, hardMax: 9 }),
  },
  {
    /**
     * 이탈리아어는 **규칙 적용 전용**이다(2026-08-26). 번역 도착어 목록에는
     * 안 뜨고(`enabled: false`) `/polish`에서만 쓰인다 — 요청이 "이미
     * 이탈리아어인 자막을 다듬는 것"이었고, 번역까지 열려면
     * `translation_rules_it.txt`가 따로 필요하다.
     *
     * 라틴계 값은 스페인어·프랑스어와 같다: 42자, 문장부호 유지, T-V 존대축
     * (Lei/tu). 읽기 속도는 아무도 안 쟀으므로 `LATIN_SHAPE` 공통값.
     */
    code: 'it',
    label: 'Italiano',
    mono: 'IT',
    enabled: false,
    polish: true,
    promptLabel: '이탈리아어',
    lineMaxChars: 42,
    formality: T_V_AXIS('Lei', 'tu'),
    trailingPunctuation: '',
    ellipsis: '…',
    shapes: uniformShapes(LATIN_SHAPE),
  },
  {
    code: 'de',
    label: 'Deutsch',
    mono: 'DE',
    enabled: true,
    polish: false,
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

/**
 * 규칙 적용 경로의 게이트. 번역 게이트와 **다른 플래그**를 본다 — 두 경로가
 * 요구하는 프롬프트가 다르기 때문이다(`TargetLang.polish` 주석 참조).
 * `/api/polish`의 세 작업(줄바꿈·합치기·잇기)이 전부 이걸 통과해야 돈다.
 */
export function getPolishTargetLang(code: string): TargetLang | undefined {
  const lang = getTargetLang(code);
  return lang?.polish ? lang : undefined;
}

/** 규칙 적용을 지원하는 언어 전부 — 화면의 "바꾸기" 목록이 이걸 쓴다. */
export const POLISH_LANGS: TargetLang[] = TARGET_LANGS.filter(
  (lang) => lang.polish,
);

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
