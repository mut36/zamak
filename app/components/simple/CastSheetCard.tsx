'use client';

import { useEffect, useRef, useState } from 'react';
import type { CastSheet } from '../../types/glossary';
import { resolveTargetLang } from '../../config/languages';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import { ChevronDownIcon, RefreshIcon, SpinnerIcon } from '../icons';
import { COPY } from '../../i18n/simpleCopy';
import { GlossaryTermsTab } from './GlossaryTermsTab';
import { SpeechRelationsTab } from './SpeechRelationsTab';

const c = COPY.info.castSheet;

interface CastSheetCardProps {
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
 * 프로 번역에 딸려 오는 결과 카드다 — 토글이 아니다(§6-25). 카드가 보이는
 * 것 자체가 "이 번역에 글로사리가 붙는다"는 뜻이므로 헤더는 접기/펴기만
 * 한다. A failed extraction degrades to an empty, still-editable sheet rather
 * than an error banner — translation proceeds normally either way.
 *
 * **기본으로 펼쳐서 보여준다(C0).** 번역 AI가 이 표를 그대로 따르므로, 표가
 * 사람 눈앞에 오지 않으면 "검토된 표"라는 전제가 거짓이 된다(스펙 §3-0).
 * 확인 버튼이나 강제 게이트는 두지 않는다 — 매번 눌러야 하는 확인은 결국
 * 안 읽고 누르는 확인이 된다. 안 읽는 것은 사용자의 선택으로 두되, 우리가
 * 숨기지는 않는다.
 */
export function CastSheetCard({
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

  // 추출이 끝난 직후의 시트를 기억해 두고, 지금 시트와 다르면 사람이 고친
  // 것으로 본다. 시트의 소유자는 훅이고 카드는 받아 쓰기만 하므로, dirty
  // 플래그를 따로 나르는 것보다 여기서 비교하는 편이 상태가 하나 적다.
  const extractedRef = useRef<string>('');

  useEffect(() => {
    if (status === 'ready') extractedRef.current = JSON.stringify(sheet);
    // status가 'ready'로 바뀌는 순간에만 기준선을 잡는다. sheet를 의존성에
    // 넣으면 사용자가 고칠 때마다 기준선이 따라 움직여 항상 깨끗해 보인다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const isEdited =
    extractedRef.current !== '' && JSON.stringify(sheet) !== extractedRef.current;

  const itemCount = sheet.terms.length;
  const extracting = status === 'extracting';
  const hasResult = status === 'ready' || status === 'error';

  return (
    <div className='card mt-4 overflow-hidden'>
      <button
        type='button'
        className='w-full flex items-center gap-3 p-[18px_24px] text-left'
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className='flex-1 min-w-0'>
          <span className='flex items-center gap-2'>
            <span className='text-title-sm font-semibold tracking-[-0.01em]'>{c.title}</span>
            {hasResult && (
              <span className='text-fineprint text-secondary'>{c.count(itemCount)}</span>
            )}
          </span>
          <span className='block text-caption-sm text-tertiary mt-0.5'>{c.hint}</span>
        </span>
        {extracting && <SpinnerIcon className='w-4 h-4 text-accent shrink-0' />}
        {hasResult && (
          <ChevronDownIcon
            className='w-4 h-4 text-secondary transition-transform shrink-0'
            style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
          />
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
              onClick={() => {
                if (isEdited && !confirm(c.refetchConfirm)) return;
                onRefetch();
              }}
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
