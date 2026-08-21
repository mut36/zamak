'use client';

import type { CastSheet, GlossaryTerm } from '../../types/glossary';
import { resolveTargetLang } from '../../config/languages';
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
    const terms = sheet.terms.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onChangeSheet({ ...sheet, terms });
  };

  const removeTerm = (index: number) => {
    const removed = sheet.terms[index];
    const terms = sheet.terms.filter((_, i) => i !== index);
    // A term that backs a relation shouldn't leave a dangling reference.
    const relations = sheet.relations.filter(
      (r) => r.from !== removed.target && r.to !== removed.target,
    );
    onChangeSheet({ ...sheet, terms, relations });
  };

  const addTerm = () => {
    onChangeSheet({
      ...sheet,
      terms: [...sheet.terms, { source: '', target: '', kind: 'term' }],
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
        <div key={i} className='flex items-center gap-2 mb-2'>
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
