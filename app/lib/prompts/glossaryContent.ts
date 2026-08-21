import {
  GLOSSARY_MAX_RELATION_CHARS,
  GLOSSARY_MAX_TERM_CHARS,
} from '../../config/constants';
import type { FormalityAxis } from '../../config/languages';
import type {
  CastSheet,
  GlossaryTerm,
  NarrationStyle,
  SpeechRelation,
} from '../../types/glossary';
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
    ? `- ${term.source} → ${term.target} (${detail})`
    : `- ${term.source} → ${term.target}`;
}

/**
 * Formality is stored language-neutral, so it is spelled out here in the
 * target language's own terms (존댓말 / 敬語 / usted…) — "formal" alone tells
 * the model nothing about which construction to actually use.
 */
function relationLine(relation: SpeechRelation, axis: FormalityAxis): string {
  const speech = axis[relation.speech];
  return relation.basis
    ? `- ${relation.from} → ${relation.to}: ${speech} (${relation.basis})`
    : `- ${relation.from} → ${relation.to}: ${speech}`;
}

/** Two block ranges overlap when neither ends before the other starts. */
function overlaps(relation: SpeechRelation, range: BlockIndexRange): boolean {
  return relation.toBlock >= range.min && relation.fromBlock <= range.max;
}

function buildTag(name: string, lines: readonly string[]): string {
  return lines.length > 0 ? `<${name}>\n${lines.join('\n')}\n</${name}>` : '';
}

/** 자기 캡에 들어갈 때까지 뒤에서부터 줄을 버린다. */
function trimToCap(name: string, lines: readonly string[], cap: number): string[] {
  const kept = [...lines];
  while (kept.length > 0 && buildTag(name, kept).length > cap) kept.pop();
  return kept;
}

/**
 * 내레이션 문체는 태그가 아니라 한 줄로 붙는다. `<narration>` 태그를 새로 만들면
 * 시스템 프롬프트의 신뢰 경계 목록(subtitle_translation_system.txt:4)에 이름을
 * 하나 더 추가해야 하고, 그 목록은 프롬프트 인젝션 방어의 정의다 — 문장 하나를
 * 위해 늘릴 자리가 아니다.
 *
 * 문구가 `app/i18n`이 아니라 여기 있는 이유: 화면 문구가 아니라 프롬프트다.
 */
const NARRATION_LINE: Record<Exclude<NarrationStyle, 'none'>, string> = {
  formal:
    '이 작품의 내레이션·낭독은 듣는 사람을 향한 글이다. ~습니다/~입니다로 끝내라.',
  literary:
    '이 작품의 내레이션은 혼자 하는 서술이다. ~다로 끝내라(해요체·습니다체 금지).',
  mixed:
    '이 작품에는 두 결의 내레이션이 있다. 듣는 사람을 향한 낭독은 ~습니다, 혼자 하는 서술은 ~다로 끝내라.',
};

export interface GlossaryTags {
  glossary: string;
  speechRelations: string;
  /** 'none'이면 빈 문자열 — composer의 `.filter(Boolean)`이 지운다. */
  narration: string;
}

/**
 * Render the cast sheet into the two trust-boundary tags the composer
 * injects into the user turn — <glossary> (every term, file-wide) and
 * <speech_relations> (only relations whose block range overlaps this
 * chunk's, since a relation outside this chunk's range doesn't apply here,
 * see decisions.md on the character-sheet reversal).
 *
 * 시트가 없으면 두 태그 모두 빈 문자열이고, composer의 `.filter(Boolean)`이
 * 통째로 드롭한다 — 이 기능이 없던 때와 프롬프트가 바이트 단위로 같아진다.
 * 말투 축이 없는 도착어(`axis` null — 영어·중국어)도 같은 방식으로
 * <speech_relations>만 빠지고 표기는 남는다.
 */
export function renderGlossaryTags(
  castSheet: CastSheet | undefined,
  chunkRange: BlockIndexRange | null,
  axis: FormalityAxis | null,
): GlossaryTags {
  // 내레이션은 표기·말투와 독립이다. terms가 비어도(모델이 하나도 못 뽑았거나
  // 사람이 다 지웠어도) 이 작품에 내레이션이 있다는 사실은 여전히 참이므로,
  // 아래 이른 반환보다 앞에서 정한다.
  const narration =
    castSheet && castSheet.narration !== 'none'
      ? NARRATION_LINE[castSheet.narration]
      : '';

  if (!castSheet || castSheet.terms.length === 0) {
    return { glossary: '', speechRelations: '', narration };
  }

  const termLines = castSheet.terms.map(termLine);
  const relationLines: string[] = [];
  if (axis) {
    const relevant = chunkRange
      ? castSheet.relations.filter((r) => overlaps(r, chunkRange))
      : castSheet.relations;
    relationLines.push(...relevant.map((r) => relationLine(r, axis)));
  }

  // 병적인 시트(사용자가 편집한 것 포함)가 청크당 토큰 비용을 부풀리는 걸 막는
  // 방어선. 두 태그가 서로의 예산을 잡아먹지 않도록 각자 자기 캡으로만 자른다 —
  // 합계 캡이던 시절에는 표기 40개가 예산을 다 써서 관계표가 통째로 사라졌다.
  return {
    glossary: buildTag(
      'glossary',
      trimToCap('glossary', termLines, GLOSSARY_MAX_TERM_CHARS),
    ),
    speechRelations: buildTag(
      'speech_relations',
      trimToCap('speech_relations', relationLines, GLOSSARY_MAX_RELATION_CHARS),
    ),
    narration,
  };
}
