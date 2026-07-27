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

export interface CastSheet {
  terms: GlossaryTerm[];
  relations: SpeechRelation[];
}

export const EMPTY_CAST_SHEET: CastSheet = { terms: [], relations: [] };
