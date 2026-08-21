import { describe, expect, it } from 'vitest';

import { renderGlossaryTags } from './glossaryContent';
import { getTargetLang } from '../../config/languages';
import type { CastSheet } from '../../types/glossary';

const axis = getTargetLang('ko')!.formality!;
const range = { min: 1, max: 1000 };

/** 한 줄이 30자 안팎이 되도록 만든 표기 항목 40개 — 실제 상한과 같은 개수. */
function fullTerms(): CastSheet['terms'] {
  return Array.from({ length: 40 }, (_, i) => ({
    source: `Blackwood Manor ${i}`,
    target: `블랙우드 저택 ${i}`,
    kind: 'place' as const,
  }));
}

describe('renderGlossaryTags 캡', () => {
  it('표기가 자기 캡을 가득 채워도 말투 관계가 살아남는다', () => {
    const sheet: CastSheet = {
      terms: [
        ...fullTerms(),
        { source: 'Jonathan', target: '조너선', kind: 'person' },
        { source: 'Elizabeth', target: '엘리자베스', kind: 'person' },
      ],
      relations: [
        {
          from: '조너선',
          to: '엘리자베스',
          speech: 'formal',
          basis: '초면',
          fromBlock: 1,
          toBlock: 1000,
        },
      ],
      narration: 'none',
    };

    const { glossary, speechRelations } = renderGlossaryTags(sheet, range, axis);

    expect(glossary).toContain('<glossary>');
    // 이것이 지금 조용히 깨지는 성질이다.
    expect(speechRelations).toContain('조너선 → 엘리자베스');
  });

  it('각 태그는 자기 캡으로만 잘린다', () => {
    const sheet: CastSheet = {
      terms: fullTerms(),
      relations: [],
      narration: 'none',
    };

    const { glossary } = renderGlossaryTags(sheet, range, axis);
    expect(glossary.length).toBeLessThanOrEqual(1200);
  });

  it('시트가 없으면 두 태그 모두 빈 문자열이다', () => {
    expect(renderGlossaryTags(undefined, range, axis)).toEqual({
      glossary: '',
      speechRelations: '',
      narration: '',
    });
  });
});

describe('renderGlossaryTags 내레이션', () => {
  const sheet = (narration: CastSheet['narration']): CastSheet => ({
    terms: [{ source: 'Jonathan', target: '조너선', kind: 'person' }],
    relations: [],
    narration,
  });

  it("'none'이면 아무것도 붙지 않는다", () => {
    expect(renderGlossaryTags(sheet('none'), range, axis).narration).toBe('');
  });

  it('문체가 정해져 있으면 그 어미를 지시하는 한 줄이 붙는다', () => {
    expect(renderGlossaryTags(sheet('formal'), range, axis).narration).toContain(
      '~습니다',
    );
    expect(
      renderGlossaryTags(sheet('literary'), range, axis).narration,
    ).toContain('~다로 끝내라');
    expect(renderGlossaryTags(sheet('mixed'), range, axis).narration).toContain(
      '두 결의 내레이션',
    );
  });

  it('표기가 하나도 없어도 내레이션 지시는 살아남는다', () => {
    // 표기·말투와 독립인 성질이다 — 모델이 이름을 하나도 못 뽑았다고 해서
    // 이 작품에 내레이션이 없어지지는 않는다.
    const empty: CastSheet = { terms: [], relations: [], narration: 'formal' };
    const tags = renderGlossaryTags(empty, range, axis);
    expect(tags.glossary).toBe('');
    expect(tags.narration).toContain('~습니다');
  });
});
