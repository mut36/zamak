/**
 * Third bucket, separate from MovieInfo's UI/AI split (see CLAUDE.md
 * invariant 4): a glossary + speech-relation sheet extracted once per file
 * and injected into every chunk's prompt so parallel chunks agree on name
 * spellings and formality direction. Untrusted, model-derived data — never
 * rendered as-is, always passed through the composer's trust-boundary tags.
 *
 * Target-language-neutral by construction: the sheet stores the *target*
 * rendering and a formality value that every language expresses differently
 * (존댓말/반말, 敬語/タメ口, usted/tú …). The language-facing labels live in
 * app/config/languages.ts (`TargetLang.formality`); a language whose
 * `formality` is null (English, Chinese) simply never gets relations.
 */
export type SpeechFormality = 'formal' | 'informal' | 'mixed';

export const SPEECH_FORMALITIES: SpeechFormality[] = [
  'formal',
  'informal',
  'mixed',
];

export interface GlossaryTerm {
  /** Exact string as it appears in the source subtitles. */
  source: string;
  /** Confirmed target-language rendering, fixed across every chunk. */
  target: string;
  kind: 'person' | 'place' | 'org' | 'term';
  /** Short disambiguating note, e.g. "주인공의 형". */
  note?: string;
}

export interface SpeechRelation {
  /** Speaker — matches a GlossaryTerm.target. */
  from: string;
  /** Listener — matches a GlossaryTerm.target. */
  to: string;
  speech: SpeechFormality;
  /** Short basis, e.g. "상사–부하", "초면". */
  basis?: string;
  /** Subtitle block range this relation holds for (inclusive). */
  fromBlock: number;
  toBlock: number;
}

/**
 * 이 작품에 대화가 아닌 낭독(내레이션·편지·일기·안내방송)이 나오는가, 나온다면
 * 어느 결인가. 청크마다 따로 판단하면 1번 청크는 낭독으로 3번 청크는 서술로
 * 읽어 문체가 갈리므로, 표기·말투와 같은 이유로 파일당 한 번 정한다.
 *
 * - `none`     — 없음. 프롬프트에 아무것도 붙지 않는다.
 * - `formal`   — 청자를 향한 낭독(다큐 해설·뉴스·안내방송·남에게 읽어주는 편지) → ~습니다
 * - `literary` — 혼자 하는 서술(1인칭 회상·일기·속마음) → ~다
 * - `mixed`    — 둘 다 나옴. 구분해 쓰라고만 이른다.
 */
export type NarrationStyle = 'none' | 'formal' | 'literary' | 'mixed';

export const NARRATION_STYLES: NarrationStyle[] = [
  'none',
  'formal',
  'literary',
  'mixed',
];

export interface CastSheet {
  terms: GlossaryTerm[];
  relations: SpeechRelation[];
  narration: NarrationStyle;
}

export const EMPTY_CAST_SHEET: CastSheet = {
  terms: [],
  relations: [],
  narration: 'none',
};
