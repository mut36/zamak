'use client';

import { useState } from 'react';
import type { CastSheet, GlossaryTerm, SpeechRelation } from '../../types/glossary';
import { SPEECH_FORMALITIES } from '../../types/glossary';
import { resolveTargetLang } from '../../config/languages';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import { ChevronDownIcon, RefreshIcon, SpinnerIcon } from '../icons';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.info.castSheet;

interface CastSheetCardProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  status: CastSheetStatus;
  sheet: CastSheet;
  onChangeSheet: (sheet: CastSheet) => void;
  onRefetch: () => void;
  /** Target language code — decides the 표기 column's label and whether the
   * 말투 tab exists at all (English/Chinese have no formality axis). */
  targetLang: string;
}

/**
 * Independent toggle from the translation model (고급/빠른번역) — see
 * docs/decisions.md. The header row *is* the toggle; the body only appears
 * once enabled, and only once extraction has something to show. A failed
 * extraction degrades to an empty, still-editable sheet rather than an error
 * banner — translation proceeds normally either way.
 */
export function CastSheetCard({
  enabled,
  onToggle,
  status,
  sheet,
  onChangeSheet,
  onRefetch,
  targetLang,
}: CastSheetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'terms' | 'relations'>('terms');

  const language = resolveTargetLang(targetLang);
  const axis = language.formality;
  // Without a formality axis there are no relations to edit, so the tab is
  // dropped rather than shown empty.
  const activeTab = axis ? tab : 'terms';

  const itemCount = sheet.terms.length;
  const extracting = enabled && status === 'extracting';
  const hasResult = enabled && (status === 'ready' || status === 'error');

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

  const updateRelation = (index: number, patch: Partial<SpeechRelation>) => {
    const relations = sheet.relations.map((r, i) =>
      i === index ? { ...r, ...patch } : r,
    );
    onChangeSheet({ ...sheet, relations });
  };

  const removeRelation = (index: number) => {
    onChangeSheet({ ...sheet, relations: sheet.relations.filter((_, i) => i !== index) });
  };

  return (
    <div className='card mt-4 overflow-hidden'>
      <button
        type='button'
        className='w-full flex items-center gap-3 p-[18px_24px] text-left'
        onClick={() => {
          if (!enabled) {
            onToggle(true);
            setExpanded(true);
          } else {
            onToggle(false);
          }
        }}
      >
        <span className='flex-1 min-w-0'>
          <span className='flex items-center gap-2'>
            <span className='text-title-sm font-semibold tracking-[-0.01em]'>{c.title}</span>
            <span className='dbadge-pro'>{c.badge}</span>
            {hasResult && (
              <span className='text-fineprint text-secondary'>{c.count(itemCount)}</span>
            )}
          </span>
          <span className='block text-caption-sm text-tertiary mt-0.5'>{c.hint}</span>
        </span>
        {extracting && <SpinnerIcon className='w-4 h-4 text-accent shrink-0' />}
        <span className={`ztoggle${enabled ? ' on' : ''}`} aria-hidden>
          <span className='ztoggle-knob' />
        </span>
        {hasResult && (
          <span
            role='button'
            tabIndex={-1}
            className='shrink-0'
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <ChevronDownIcon
              className='w-4 h-4 text-secondary transition-transform'
              style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
            />
          </span>
        )}
      </button>

      {extracting && (
        <p className='px-[14px] pb-[14px] text-fineprint text-secondary'>{c.extracting}</p>
      )}

      {hasResult && expanded && (
        <div className='px-[14px] pb-[14px]'>
          <div className='flex gap-1 mb-3'>
            <button
              type='button'
              className={activeTab === 'terms' ? 'btn btn-ghost !py-1.5 !px-3 !text-fineprint' : 'btn btn-ghost !py-1.5 !px-3 !text-fineprint opacity-50'}
              onClick={() => setTab('terms')}
            >
              {c.tabTerms}
            </button>
            {axis && (
              <button
                type='button'
                className={activeTab === 'relations' ? 'btn btn-ghost !py-1.5 !px-3 !text-fineprint' : 'btn btn-ghost !py-1.5 !px-3 !text-fineprint opacity-50'}
                onClick={() => setTab('relations')}
              >
                {c.tabRelations}
              </button>
            )}
            <button
              type='button'
              className='btn btn-ghost !py-1.5 !px-3 !text-fineprint ml-auto'
              onClick={onRefetch}
            >
              <RefreshIcon className='w-3.5 h-3.5' />
              {c.refetch}
            </button>
          </div>

          {activeTab === 'terms' ? (
            <div>
              {!axis && (
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
          ) : (
            <div>
              {sheet.relations.length === 0 && (
                <p className='text-fineprint text-secondary mb-2'>{c.emptyRelations}</p>
              )}
              {sheet.relations.map((rel, i) => (
                <div key={i} className='flex items-center gap-2 mb-2 flex-wrap'>
                  <select
                    className='input !py-1.5 !w-auto'
                    value={rel.from}
                    onChange={(e) => updateRelation(i, { from: e.target.value })}
                  >
                    {sheet.terms.map((t) => (
                      <option key={t.target} value={t.target}>
                        {t.target}
                      </option>
                    ))}
                  </select>
                  <span className='text-secondary'>→</span>
                  <select
                    className='input !py-1.5 !w-auto'
                    value={rel.to}
                    onChange={(e) => updateRelation(i, { to: e.target.value })}
                  >
                    {sheet.terms.map((t) => (
                      <option key={t.target} value={t.target}>
                        {t.target}
                      </option>
                    ))}
                  </select>
                  <div className='flex gap-1'>
                    {SPEECH_FORMALITIES.map((option) => (
                      <button
                        key={option}
                        type='button'
                        className='btn btn-ghost !py-1 !px-2 !text-fineprint'
                        style={
                          rel.speech === option
                            ? { background: 'var(--ink-strong)', color: 'white' }
                            : undefined
                        }
                        onClick={() => updateRelation(i, { speech: option })}
                      >
                        {axis?.[option] ?? option}
                      </button>
                    ))}
                  </div>
                  <span className='text-mono-step text-secondary'>
                    {c.relationRange(rel.fromBlock, rel.toBlock)}
                  </span>
                  <button
                    type='button'
                    className='btn btn-ghost !py-1.5 !px-2 !text-fineprint ml-auto'
                    aria-label={c.removeRow}
                    onClick={() => removeRelation(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
