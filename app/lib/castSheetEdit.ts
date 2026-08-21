import type { CastSheet, GlossaryTerm } from '../types/glossary';

/**
 * 표기 표 편집이 말투 관계에 미치는 영향을 한곳에 모은다.
 *
 * 관계(`SpeechRelation`)는 사람을 `GlossaryTerm.target` **문자열**로 가리킨다.
 * 그래서 표기를 고치거나 지우는 순간 관계가 가리키던 이름이 사라질 수 있고,
 * 그걸 그냥 두면 서버(`parseCastSheet`)가 말없이 버린다 — 사용자는 "있는 줄
 * 알았던 관계"를 잃는다. 화면에서 미리 정리해 그 손실을 눈에 보이게 한다.
 *
 * 컴포넌트가 아니라 여기 있는 이유: 이 규칙이 한 번 틀려서 표기를 고치자
 * 말투 표가 통째로 사라진 적이 있고(2026-08-21), 그때 컴포넌트 안에 있어
 * 테스트로 막을 수가 없었다.
 */
function speakersOf(terms: GlossaryTerm[]): Set<string> {
  return new Set(terms.filter((t) => t.kind === 'person').map((t) => t.target));
}

/**
 * 표기 한 항목을 고친다.
 *
 * **표기를 바꾸면 관계는 따라 바뀐다(버리지 않는다).** 이름만 고쳤을 뿐인데
 * 관계를 지우면 풀네임을 줄이는 흔한 교정이 말투 표를 통째로 날린다.
 * 다만 같은 target을 쓰는 항목이 아직 남아 있으면(축약형·전체형이 한 사람을
 * 가리키는 정상 데이터) 그쪽이 여전히 그 이름을 대므로 따라 바꾸지 않는다.
 *
 * 인물에서 다른 유형으로 바뀐 경우에만 그 사람이 낀 관계를 버린다 —
 * 화자·청자는 인물이어야 하고, 서버도 같은 규칙으로 버린다.
 */
export function applyTermPatch(
  sheet: CastSheet,
  index: number,
  patch: Partial<GlossaryTerm>,
): CastSheet {
  const before = sheet.terms[index];
  if (!before) return sheet;

  const after = { ...before, ...patch };
  const terms = sheet.terms.map((t, i) => (i === index ? after : t));

  const renamed =
    patch.target !== undefined &&
    after.target !== before.target &&
    !terms.some((t, i) => i !== index && t.target === before.target);
  const rename = (name: string) =>
    renamed && name === before.target ? after.target : name;

  const speakers = speakersOf(terms);
  const relations = sheet.relations
    .map((r) => ({ ...r, from: rename(r.from), to: rename(r.to) }))
    .filter((r) => speakers.has(r.from) && speakers.has(r.to));

  return { ...sheet, terms, relations };
}

/**
 * 표기 한 항목을 지운다. 판단 기준은 **남은 항목**이다 — 지운 항목의 target만
 * 보고 버리면, 같은 사람을 가리키는 항목이 하나 더 있어 이름을 여전히 댈 수
 * 있는데도 관계가 사라진다.
 */
export function removeTermAt(sheet: CastSheet, index: number): CastSheet {
  const terms = sheet.terms.filter((_, i) => i !== index);
  const speakers = speakersOf(terms);
  return {
    ...sheet,
    terms,
    relations: sheet.relations.filter(
      (r) => speakers.has(r.from) && speakers.has(r.to),
    ),
  };
}
