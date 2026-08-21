'use client';

import { useState } from 'react';
import { ChevronDownIcon, PencilIcon, SpinnerIcon } from '../icons';
import { StepBreadcrumb } from '../StepBreadcrumb';
import { CastSheetCard } from '../simple/CastSheetCard';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import type { CastSheet } from '../../types/glossary';
import type { CreditBalances } from '../../lib/creditKind';
import type { ContentType, MovieInfo } from '../../types/translation';
import {
  BLOCKS_PER_CREDIT,
  FLASH_MODEL,
  PRO_MODEL,
  type AllowedModel,
} from '../../config/constants';
import { glossaryAppliesTo } from '../../lib/glossaryGate';
import { COPY } from '../../i18n/simpleCopy';

const c = COPY.settings;

interface TranslateSettingsStepProps {
  /** Gates the confirm banner / confirmed-work card (movie branch only) —
   *  'other' content never runs runEnrich, so movieInfo.posterUrl/title are
   *  always empty for it and would render a broken-looking card. */
  contentType: ContentType;
  movieInfo: MovieInfo;
  onMovieInfo: (patch: Partial<MovieInfo>) => void;
  /** autoMatched && !workConfirmed, computed by the caller (useWizard). */
  needsConfirm: boolean;
  /** True while the TMDB search is still in flight. The upload step hands off
   *  to this screen before the search settles (see useWizard.handleFile), so
   *  the work card has to be able to say "still looking" rather than render an
   *  empty title. */
  searching: boolean;
  onConfirmWork: () => void;
  onChangeWork: () => void;
  model: AllowedModel;
  onModel: (m: AllowedModel) => void;
  credits: CreditBalances | null;
  // cast sheet — 프로 번역에 딸려 오는 결과 카드다(토글 아님, §6-25). 공유:
  // both branches (see docs/decisions.md)
  castSheetStatus: CastSheetStatus;
  castSheet: CastSheet;
  onCastSheetChange: (sheet: CastSheet) => void;
  onCastSheetRefetch: () => void;
  /** Target language code — the cast sheet's 표기/말투 columns follow it. */
  targetLang: string;
  /** 총 블록 수 — 말투 관계의 구간 상한. useWizard의 totalLines를 그대로 받는다. */
  blockCount: number;
  etaSeconds: number;
  /** 자막이 덮는 영상 길이(분). 타임코드가 없으면 null — 견적이 분을 뺀다. */
  runtimeMinutes: number | null;
  /** Credits pressing start will spend — distinct from `credits` above, which
   *  is the account's balances. Repeated here rather than only on the upload
   *  screen because work-pick and the glossary sit between the two, and the
   *  charge has to be on screen at the moment of commitment. */
  creditCost: number;
  onStart: () => void;
}

const CARDS = [
  { model: FLASH_MODEL, name: c.liteName, desc: c.liteDesc },
  { model: PRO_MODEL, name: c.proName, desc: c.proDesc },
] as const;

export function TranslateSettingsStep({
  contentType,
  movieInfo,
  onMovieInfo,
  needsConfirm,
  searching,
  onConfirmWork,
  onChangeWork,
  model,
  onModel,
  credits,
  castSheetStatus,
  castSheet,
  onCastSheetChange,
  onCastSheetRefetch,
  targetLang,
  blockCount,
  etaSeconds,
  runtimeMinutes,
  creditCost,
  onStart,
}: TranslateSettingsStepProps) {
  const cardCredits = {
    [FLASH_MODEL]: credits?.lite ?? 0,
    [PRO_MODEL]: credits?.pro ?? 0,
  } as const;
  const [showPlanInfo, setShowPlanInfo] = useState(false);
  const plans = COPY.plans;

  return (
    <>
    <div className='animate-zslide pb-28 max-w-[760px] mx-auto'>
      <StepBreadcrumb current='settings' className='mb-6' />
      <div className='head mb-8'>
        <h1>{c.title}</h1>
        <p>{c.subtitleAuto}</p>
      </div>

      <p className='qlabel'>{c.sectionWork}</p>

      {contentType === 'movie' && searching && (
        <div className='card p-[18px_20px] mb-[14px] flex items-center gap-3'>
          <SpinnerIcon className='w-5 h-5 text-accent' />
          <span className='text-caption text-nav'>{COPY.info.searching}</span>
        </div>
      )}

      {contentType === 'movie' && !searching && needsConfirm && (
        <div
          className='rounded-card border-[1.5px] p-[18px_24px] mb-[14px] bg-surface border-accent'
          style={{ boxShadow: 'var(--shadow-accent)' }}
        >
          <div className='flex items-center gap-[6px] mb-[5px]'>
            <span className='zchip-dot animate-zbreathe w-[6px] h-[6px]' />
            <span className='mono text-micro tracking-[0.06em] text-secondary'>
              {c.confirmBadge}
            </span>
          </div>
          <p className='text-title-sm font-semibold tracking-[-0.01em]'>
            {c.confirmQuestion(movieInfo.title || '—')}
          </p>
          <p className='text-caption-sm text-secondary mt-1'>{c.confirmHint}</p>
          <div className='flex gap-2 mt-3'>
            <button
              type='button'
              className='btn btn-primary'
              onClick={onConfirmWork}
            >
              {c.confirmYes}
            </button>
            <button
              type='button'
              className='btn btn-ghost'
              onClick={onChangeWork}
            >
              {c.confirmNo}
            </button>
          </div>
        </div>
      )}

      {contentType === 'movie' && !searching && !needsConfirm && (
        <div className='card detected mb-[14px]'>
          <div className='poster'>
            {movieInfo.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={movieInfo.posterUrl}
                alt={COPY.info.posterAlt(movieInfo.title || '')}
                className='w-full h-full object-cover'
              />
            ) : (
              <span>{COPY.info.posterEmpty}</span>
            )}
          </div>
          <div className='min-w-0'>
            <div className='dtitle truncate'>{movieInfo.title || '—'}</div>
            <div className='dmeta'>
              {movieInfo.year || '—'}
              {movieInfo.director &&
                ` · ${COPY.info.labelDirector} ${movieInfo.director}`}
            </div>
            <div className='dbadge'>
              <b />
              {COPY.info.detectedBadge}
            </div>
          </div>
          <button
            type='button'
            className='btn btn-ghost ml-auto self-start !px-3 !py-2 !text-caption'
            onClick={onChangeWork}
          >
            <PencilIcon />
            {c.changeWork}
          </button>
        </div>
      )}

      {/* Non-movie content has no TMDB card, so its "what is this" surface is the
          auto-written summary /api/summarize put into movieInfo.notes. That
          value ships to the prompt as <user_notes>, and notes is by invariant
          사용자 자유 입력 전용 (CLAUDE.md) — so it must stay visible and
          editable rather than being machine-written behind the user's back. */}
      {contentType !== 'movie' && (
        <div className='card p-[18px] mb-[14px]'>
          <div className='dbadge mb-3'>
            <b />
            {COPY.info.summaryBadge}
          </div>
          <div className='field !mb-0'>
            <label>{COPY.info.otherNotesLabel}</label>
            <textarea
              className='input'
              rows={5}
              placeholder={COPY.info.otherNotesHint}
              value={movieInfo.notes}
              onChange={(e) => onMovieInfo({ notes: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className='card p-[18px] mb-[14px]'>
        <div className='dbadge mb-3'>
          <b />
          {c.contextEditable}
        </div>
        <div className='field !mb-0'>
          <label>{c.genreLabel}</label>
          <input
            className='input'
            placeholder={c.genrePlaceholder}
            value={movieInfo.genre ?? ''}
            onChange={(e) => onMovieInfo({ genre: e.target.value })}
          />
        </div>
        <div className='field mt-3 !mb-0'>
          <label>{c.eraLabel}</label>
          <input
            className='input'
            placeholder={c.eraPlaceholder}
            value={movieInfo.era ?? ''}
            onChange={(e) => onMovieInfo({ era: e.target.value })}
          />
        </div>
        <div className='field mt-3 !mb-0'>
          <label>{c.toneLabel}</label>
          <input
            className='input'
            placeholder={c.tonePlaceholder}
            value={movieInfo.tone ?? ''}
            onChange={(e) => onMovieInfo({ tone: e.target.value })}
          />
        </div>
        <p className='text-fineprint text-secondary mt-3'>{c.contextHint}</p>
      </div>

      {/* 랜딩의 "라이트 vs 프로" 섹션과 같은 `COPY.plans`를 읽는 팝오버.
          두 화면이 서로 다른 시간을 약속하는 일이 없도록 소스를 하나로
          묶었다 — `decisions.md` §1-23. */}
      <div className='flex items-center justify-between'>
        <p className='qlabel !mb-0'>{c.sectionQuality}</p>
        <button
          type='button'
          onClick={() => setShowPlanInfo((v) => !v)}
          aria-expanded={showPlanInfo}
          className='plan-info-toggle'
        >
          {c.plansInfoToggle}
          <ChevronDownIcon />
        </button>
      </div>

      {showPlanInfo && (
        <div className='card animate-fade-slide-up p-[14px_16px] mb-[10px] overflow-x-auto'>
          <table className='w-full text-caption-sm border-collapse'>
            <thead>
              <tr>
                <th className='text-left font-medium text-tertiary pb-2 pr-2'> </th>
                <th className='text-left font-semibold text-ink pb-2 pr-2'>
                  {plans.lite.name}
                </th>
                <th className='text-left font-semibold text-ink pb-2'>
                  {plans.pro.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {plans.rows.map((row) => (
                <tr key={row.key} className='border-t border-border-subtle'>
                  <td className='py-2 pr-2 text-tertiary whitespace-nowrap'>
                    {row.label}
                  </td>
                  <td className='py-2 pr-2 text-ink break-keep'>
                    {plans.lite[row.key as keyof typeof plans.lite]}
                  </td>
                  <td className='py-2 text-ink break-keep'>
                    {plans.pro[row.key as keyof typeof plans.pro]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className='grid grid-cols-2 gap-[14px] mb-[14px] mt-[10px]'>
        {CARDS.map((card) => {
          const left = cardCredits[card.model];
          const selected = model === card.model;
          return (
            <button
              key={card.model}
              type='button'
              onClick={() => onModel(card.model)}
              className='rounded-card border-[1.5px] p-[18px_20px] text-left transition hover:shadow-[var(--shadow-hover)] active:scale-[0.99]'
              style={{
                background: selected ? 'var(--accent-wash)' : 'var(--surface)',
                borderColor: selected ? 'var(--ink-strong)' : 'transparent',
              }}
            >
              <div className='flex justify-between items-baseline'>
                <span className='flex items-center gap-[9px] text-body-lg font-semibold tracking-[-0.01em]'>
                  <span className={`zcheck w-[18px] h-[18px] text-micro${selected ? ' on' : ''}`}>
                    {selected && '✓'}
                  </span>
                  {card.name}
                </span>
                <span
                  className='text-fineprint font-medium whitespace-nowrap'
                  style={{ color: left > 0 ? 'var(--success)' : 'var(--danger)' }}
                >
                  {c.creditsLeft(left)}
                </span>
              </div>
              <p className='mt-2 text-caption text-secondary leading-normal whitespace-pre-line'>
                {card.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* 글로사리는 프로의 약속("작품 맥락 분석과 인물명 일관성", COPY.settings.proDesc)
          중 인물명 일관성을 실제로 수행하는 부분이다. 그래서 토글이 아니라
          프로를 고르면 나타나는 결과 카드다 — docs/decisions.md §6-25. */}
      {glossaryAppliesTo(model) && (
        <>
          <p className='qlabel'>{c.sectionAdvanced}</p>
          <div className='animate-zslide mb-[14px]'>
            <CastSheetCard
              status={castSheetStatus}
              sheet={castSheet}
              onChangeSheet={onCastSheetChange}
              onRefetch={onCastSheetRefetch}
              targetLang={targetLang}
              blockCount={blockCount}
            />
          </div>
        </>
      )}
    </div>

      <div className='fixed bottom-0 left-0 right-0 z-40 glass-nav glass-bar backdrop-blur-[20px] backdrop-saturate-[180%]'>
        <div className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 py-4 flex items-center justify-center gap-4'>
          <span className='text-caption text-tertiary'>
            {c.eta(etaSeconds)}
            {/*
              번역가의 단위(분)와 우리 단위(줄) 사이를 메우는 자리(§6-23).
              러닝타임을 못 읽은 파일에서는 예전 문구로 떨어진다 — 분이
              빠졌다고 차감 장수까지 안 보이면 그게 더 나쁘다.
            */}
            {creditCost > 0 &&
              (runtimeMinutes === null
                ? ` · ${COPY.credits.cost(creditCost, BLOCKS_PER_CREDIT)}`
                : ` · ${COPY.credits.quote(blockCount, runtimeMinutes, creditCost)}`)}
          </span>
          <button
            type='button'
            onClick={onStart}
            className='text-white text-card-title font-medium px-11 py-[13px] rounded-[var(--r-btn)] transition active:scale-[0.97]'
            style={{ background: 'var(--ink-strong)' }}
          >
            {c.start}
          </button>
        </div>
      </div>
    </>
  );
}
