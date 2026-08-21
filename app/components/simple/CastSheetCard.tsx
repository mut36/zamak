'use client';

import { useState } from 'react';
import type { CastSheet } from '../../types/glossary';
import { resolveTargetLang } from '../../config/languages';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import { ChevronDownIcon, RefreshIcon, SpinnerIcon } from '../icons';
import { COPY } from '../../i18n/simpleCopy';
import { GlossaryTermsTab } from './GlossaryTermsTab';
import { SpeechRelationsTab } from './SpeechRelationsTab';

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
  /** 총 블록 수 — 말투 관계의 구간이 넘어설 수 없는 상한. */
  blockCount: number;
}

/**
 * Independent toggle from the translation model (고급/빠른번역) — see
 * docs/decisions.md. The header row *is* the toggle; the body only appears
 * once enabled, and only once extraction has something to show. A failed
 * extraction degrades to an empty, still-editable sheet rather than an error
 * banner — translation proceeds normally either way.
 *
 * **기본으로 펼쳐서 보여준다(C0).** 번역 AI가 이 표를 그대로 따르므로, 표가
 * 사람 눈앞에 오지 않으면 "검토된 표"라는 전제가 거짓이 된다(스펙 §3-0).
 * 확인 버튼이나 강제 게이트는 두지 않는다 — 매번 눌러야 하는 확인은 결국
 * 안 읽고 누르는 확인이 된다. 안 읽는 것은 사용자의 선택으로 두되, 우리가
 * 숨기지는 않는다.
 */
export function CastSheetCard({
  enabled,
  onToggle,
  status,
  sheet,
  onChangeSheet,
  onRefetch,
  targetLang,
  blockCount,
}: CastSheetCardProps) {
  const language = resolveTargetLang(targetLang);
  const axis = language.formality;

  const [expanded, setExpanded] = useState(true);
  // 말투가 기본 탭인 이유: 표기는 첫 실측에서 이형 0건으로 완벽했고, 틀릴 수
  // 있는 쪽이 말투다. 축이 없는 언어에는 말투 탭 자체가 없으므로 표기로 간다.
  const [tab, setTab] = useState<'terms' | 'relations'>(
    axis ? 'relations' : 'terms',
  );
  // Without a formality axis there are no relations to edit, so the tab is
  // dropped rather than shown empty.
  const activeTab = axis ? tab : 'terms';

  const itemCount = sheet.terms.length;
  const extracting = enabled && status === 'extracting';
  const hasResult = enabled && (status === 'ready' || status === 'error');

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
            <GlossaryTermsTab
              sheet={sheet}
              onChangeSheet={onChangeSheet}
              targetLang={targetLang}
            />
          ) : (
            // activeTab이 'relations'인 것은 axis가 non-null일 때뿐이다
            // (activeTab = axis ? tab : 'terms').
            <SpeechRelationsTab
              sheet={sheet}
              onChangeSheet={onChangeSheet}
              axis={axis!}
              blockCount={blockCount}
            />
          )}
        </div>
      )}
    </div>
  );
}
