'use client';

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
export function GlossaryTermsTab({
  sheet,
  onChangeSheet,
  targetLang,
}: GlossaryTermsTabProps) {
  const language = resolveTargetLang(targetLang);

  const updateTerm = (index: number, patch: Partial<GlossaryTerm>) => {
    onChangeSheet(applyTermPatch(sheet, index, patch));
  };

  const removeTerm = (index: number) => {
    onChangeSheet(removeTermAt(sheet, index));
  };

  const addTerm = () => {
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
      {sheet.terms.map((term, i) => (
        <div key={i} className='flex items-center gap-2 mb-2 flex-wrap'>
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
