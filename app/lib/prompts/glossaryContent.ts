import { GLOSSARY_MAX_CHARS } from '../../config/constants';
import type { CastSheet, GlossaryTerm, SpeechRelation } from '../../types/glossary';
import type { BlockIndexRange } from '../srt';

const KIND_LABEL: Record<GlossaryTerm['kind'], string> = {
  person: '인물',
  place: '장소',
  org: '조직',
  term: '용어',
};

function termLine(term: GlossaryTerm): string {
  const detail = [KIND_LABEL[term.kind], term.note].filter(Boolean).join(', ');
  return detail
    ? `- ${term.source} → ${term.ko} (${detail})`
    : `- ${term.source} → ${term.ko}`;
}

function relationLine(relation: SpeechRelation): string {
  return relation.basis
    ? `- ${relation.from} → ${relation.to}: ${relation.speech} (${relation.basis})`
    : `- ${relation.from} → ${relation.to}: ${relation.speech}`;
}

/** Two block ranges overlap when neither ends before the other starts. */
function overlaps(relation: SpeechRelation, range: BlockIndexRange): boolean {
  return relation.toBlock >= range.min && relation.fromBlock <= range.max;
}

function buildTag(name: string, lines: readonly string[]): string {
  return lines.length > 0 ? `<${name}>\n${lines.join('\n')}\n</${name}>` : '';
}

/** Total serialized length of both tags together, as actually sent. */
function combinedLength(termLines: string[], relationLines: string[]): number {
  return (
    buildTag('glossary', termLines).length +
    buildTag('speech_relations', relationLines).length
  );
}

export interface GlossaryTags {
  glossary: string;
  speechRelations: string;
}

/**
 * Render the cast sheet into the two trust-boundary tags the composer
 * injects into the user turn — <glossary> (every term, file-wide) and
 * <speech_relations> (only relations whose block range overlaps this
 * chunk's, since a relation outside this chunk's range doesn't apply here,
 * see decisions.md on the character-sheet reversal).
 *
 * No castSheet (the default — this feature is an opt-in InfoStep toggle)
 * renders both as empty strings, which the composer's `.filter(Boolean)`
 * then drops entirely: the prompt is byte-identical to before this feature
 * existed.
 */
export function renderGlossaryTags(
  castSheet: CastSheet | undefined,
  chunkRange: BlockIndexRange | null,
): GlossaryTags {
  if (!castSheet || castSheet.terms.length === 0) {
    return { glossary: '', speechRelations: '' };
  }

  const termLines = castSheet.terms.map(termLine);
  const relevantRelations = chunkRange
    ? castSheet.relations.filter((r) => overlaps(r, chunkRange))
    : castSheet.relations;
  const relationLines = relevantRelations.map(relationLine);

  // Defense in depth against a pathological sheet (e.g. a user-edited one)
  // blowing up the per-chunk token cost: drop relations first (they are the
  // less foundational of the two — spelling consistency matters more than
  // formality hints), then terms, until under the cap.
  while (
    combinedLength(termLines, relationLines) > GLOSSARY_MAX_CHARS &&
    (relationLines.length > 0 || termLines.length > 0)
  ) {
    if (relationLines.length > 0) relationLines.pop();
    else termLines.pop();
  }

  return {
    glossary: buildTag('glossary', termLines),
    speechRelations: buildTag('speech_relations', relationLines),
  };
}
