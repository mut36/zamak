/**
 * Third bucket, separate from MovieInfo's UI/AI split (see CLAUDE.md
 * invariant 4): a glossary + speech-relation sheet extracted once per file
 * and injected into every chunk's prompt so parallel chunks agree on name
 * spellings and honorific direction. Untrusted, model-derived data — never
 * rendered as-is, always passed through the composer's trust-boundary tags.
 */
export interface GlossaryTerm {
  /** Exact string as it appears in the source subtitles. */
  source: string;
  /** Confirmed Korean rendering, fixed across every chunk. */
  ko: string;
  kind: 'person' | 'place' | 'org' | 'term';
  /** Short disambiguating note, e.g. "주인공의 형". */
  note?: string;
}

export interface SpeechRelation {
  /** Speaker — matches a GlossaryTerm.ko. */
  from: string;
  /** Listener — matches a GlossaryTerm.ko. */
  to: string;
  speech: '존댓말' | '반말' | '혼용';
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
