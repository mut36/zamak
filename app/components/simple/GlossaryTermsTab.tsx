'use client';

import { useState } from 'react';
import type { CastSheet, GlossaryTerm } from '../../types/glossary';
import { resolveTargetLang } from '../../config/languages';
import { applyTermPatch, removeTermAt } from '../../lib/castSheetEdit';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.info.castSheet;

interface GlossaryTermsTabProps {
  sheet: CastSheet;
  onChangeSheet: (sheet: CastSheet) => void;
  /** 도착어 코드 — 표기 열의 라벨과, 말투 축 없는 언어의 안내문을 정한다. */
  targetLang: string;
}

/**
 * 표기 기준표 편집. 여기서 확정된 target이 모든 청크의 고정 표기가 되므로,
 * 사용자의 수정이 곧 최종 권위다(`prompts/common/glossary_directive.txt`).
 */
/**
 * 화면에 묶어 보여줄 순서. `sheet.terms`의 **배열 순서는 건드리지 않는다** —
 * 추출이 등장 빈도 내림차순으로 정렬해 놓은 것이고(`sanitizeCastSheet`),
 * 프롬프트 렌더의 글자 수 캡(`trimToCap`)이 **뒤에서부터** 버리기 때문에
 * 배열 순서가 곧 "캡에 걸리면 무엇을 포기하는가"다. 유형별로 실제 정렬해
 * 버리면 캡이 중요도와 무관하게 '용어'부터 통째로 날린다.
 */
const KIND_ORDER: GlossaryTerm['kind'][] = ['person', 'place', 'org', 'term'];

export function GlossaryTermsTab({
  sheet,
  onChangeSheet,
  targetLang,
}: GlossaryTermsTabProps) {
  const language = resolveTargetLang(targetLang);
  /** 방금 추가한 행의 실제 인덱스 — 유형별로 묶으면 새 행이 목록 중간에
   *  꽂히므로, 어디로 갔는지 눈으로 찾게 두지 않고 커서를 보낸다. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  // 실제 인덱스를 들고 다니는 표시용 순서. Array.prototype.sort는 안정 정렬이라
  // 같은 유형 안에서는 빈도순이 그대로 유지된다.
  const rows = sheet.terms
    .map((term, index) => ({ term, index }))
    .sort((a, b) => KIND_ORDER.indexOf(a.term.kind) - KIND_ORDER.indexOf(b.term.kind));

  const updateTerm = (index: number, patch: Partial<GlossaryTerm>) => {
    onChangeSheet(applyTermPatch(sheet, index, patch));
  };

  const removeTerm = (index: number) => {
    onChangeSheet(removeTermAt(sheet, index));
  };

  const addTerm = () => {
    setFocusIndex(sheet.terms.length);
    onChangeSheet({
      ...sheet,
      // 사용자가 손으로 넣는 항목은 대개 모델이 놓친 인물이고, 인물이어야
      // 말투 표에서 화자·청자로 쓸 수 있다.
      terms: [...sheet.terms, { source: '', target: '', kind: 'person' }],
    });
  };

  return (
    <div>
      {!language.formality && (
        <p className='text-fineprint text-secondary mb-2'>
          {c.noFormality(language.label)}
        </p>
      )}
      {sheet.terms.length === 0 && (
        <p className='text-fineprint text-secondary mb-2'>{c.emptyTerms}</p>
      )}
      {rows.map(({ term, index: i }, position) => (
        <div key={i}>
          {/* 유형이 바뀌는 자리에만 이름표를 하나 둔다 — 행마다 셀렉트로도
              보이지만, 섞여 있으면 어디까지가 인물인지 눈으로 안 잡힌다. */}
          {(position === 0 || rows[position - 1].term.kind !== term.kind) && (
            <p className='text-fineprint text-tertiary mt-3 mb-1'>{c.kinds[term.kind]}</p>
          )}
          <div className='flex items-center gap-2 mb-2 flex-wrap'>
          <select
            className='input !py-1.5 !w-auto'
            aria-label={c.kindLabel}
            value={term.kind}
            onChange={(e) =>
              updateTerm(i, { kind: e.target.value as GlossaryTerm['kind'] })
            }
          >
            {(Object.keys(c.kinds) as GlossaryTerm['kind'][]).map((k) => (
              <option key={k} value={k}>
                {c.kinds[k]}
              </option>
            ))}
          </select>
          <input
            className='input !py-1.5 flex-1'
            placeholder={c.termSourceLabel}
            value={term.source}
            autoFocus={i === focusIndex}
            onChange={(e) => updateTerm(i, { source: e.target.value })}
          />
          <span className='text-secondary'>→</span>
          <input
            className='input !py-1.5 flex-1'
            placeholder={c.termTargetLabel(language.label)}
            value={term.target}
            onChange={(e) => updateTerm(i, { target: e.target.value })}
          />
          <input
            className='input !py-1.5 flex-1'
            placeholder={c.notePlaceholder}
            value={term.note ?? ''}
            onChange={(e) => updateTerm(i, { note: e.target.value })}
          />
          <button
            type='button'
            className='btn btn-ghost !py-1.5 !px-2 !text-fineprint'
            aria-label={c.removeRow}
            onClick={() => removeTerm(i)}
          >
            ×
          </button>
          </div>
        </div>
      ))}
      <button
        type='button'
        className='btn btn-ghost !py-1.5 !px-3 !text-fineprint mt-1'
        onClick={addTerm}
      >
        {c.addTerm}
      </button>
    </div>
  );
}
