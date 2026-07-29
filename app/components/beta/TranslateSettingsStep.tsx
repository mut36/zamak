'use client';

import { PencilIcon } from '../icons';
import { CastSheetCard } from '../simple/CastSheetCard';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import type { CastSheet } from '../../types/glossary';
import type { CreditBalances } from '../../lib/creditKind';
import type { ContentType, MovieInfo } from '../../types/translation';
import {
  FLASH_MODEL,
  PRO_MODEL,
  type AllowedModel,
} from '../../config/constants';
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
  onConfirmWork: () => void;
  onChangeWork: () => void;
  model: AllowedModel;
  onModel: (m: AllowedModel) => void;
  credits: CreditBalances | null;
  // cast sheet — independent toggle from the translation model, shared by
  // both branches (see docs/decisions.md)
  castSheetEnabled: boolean;
  onCastSheetToggle: (value: boolean) => void;
  castSheetStatus: CastSheetStatus;
  castSheet: CastSheet;
  onCastSheetChange: (sheet: CastSheet) => void;
  onCastSheetRefetch: () => void;
  /** Target language code — the cast sheet's 표기/말투 columns follow it. */
  targetLang: string;
  etaSeconds: number;
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
  onConfirmWork,
  onChangeWork,
  model,
  onModel,
  credits,
  castSheetEnabled,
  onCastSheetToggle,
  castSheetStatus,
  castSheet,
  onCastSheetChange,
  onCastSheetRefetch,
  targetLang,
  etaSeconds,
  onStart,
}: TranslateSettingsStepProps) {
  const cardCredits = {
    [FLASH_MODEL]: credits?.lite ?? 0,
    [PRO_MODEL]: credits?.pro ?? 0,
  } as const;

  return (
    <div className='animate-fade-slide-up pb-28'>
      <div className='head text-center mb-7'>
        <h1>{c.title}</h1>
        <p>{c.subtitleAuto}</p>
      </div>

      {contentType === 'movie' && needsConfirm && (
        <div
          className='rounded-card border-[1.5px] p-[18px] mb-[14px] bg-accent-wash border-accent-line'
        >
          <p className='text-[14px] font-medium'>
            {c.confirmQuestion(movieInfo.title || '—')}
          </p>
          <p className='text-[12.5px] text-ink-3 mt-1'>{c.confirmHint}</p>
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

      {contentType === 'movie' && !needsConfirm && (
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
            <div className='dmeta'>{movieInfo.year || '—'}</div>
            <div className='dbadge'>
              <b />
              {COPY.info.detectedBadge}
            </div>
          </div>
          <button
            type='button'
            className='btn btn-ghost ml-auto self-start !px-3 !py-2 !text-[13px]'
            onClick={onChangeWork}
          >
            <PencilIcon />
            {c.changeWork}
          </button>
        </div>
      )}

      <div className='card p-[18px] mb-[14px]'>
        <div className='dbadge mb-3'>
          <b />
          {c.contextEditable}
        </div>
        <div className='field !mb-0'>
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
        <p className='text-[12px] text-ink-3 mt-3'>{c.contextHint}</p>
      </div>

      <div className='grid grid-cols-2 gap-[14px] mb-[14px]'>
        {CARDS.map((card) => {
          const left = cardCredits[card.model];
          return (
            <button
              key={card.model}
              type='button'
              onClick={() => onModel(card.model)}
              className='bg-surface rounded-card border-[1.5px] p-[22px_24px] text-left transition hover:shadow-[var(--shadow-hover)]'
              style={{ borderColor: model === card.model ? 'var(--ink)' : 'transparent' }}
            >
              <div className='flex justify-between items-baseline'>
                <span className='text-[17px] font-semibold tracking-[-0.01em]'>
                  {card.name}
                </span>
                <span
                  className='text-[12px] font-medium'
                  style={{ color: left > 0 ? 'var(--success)' : 'var(--danger)' }}
                >
                  {c.creditsLeft(left)}
                </span>
              </div>
              <p className='mt-2 text-[13.5px] text-ink-3 leading-[1.5]'>
                {card.desc}
              </p>
            </button>
          );
        })}
      </div>

      {castSheetEnabled ? (
        <div className='animate-zslide mb-[14px]'>
          <CastSheetCard
            enabled={castSheetEnabled}
            onToggle={onCastSheetToggle}
            status={castSheetStatus}
            sheet={castSheet}
            onChangeSheet={onCastSheetChange}
            onRefetch={onCastSheetRefetch}
            targetLang={targetLang}
          />
        </div>
      ) : (
        <button
          type='button'
          className='card w-full flex items-center gap-3 p-[14px] text-left mb-[14px]'
          onClick={() => onCastSheetToggle(true)}
        >
          <span
            className='inline-flex items-center justify-center w-4 h-4 rounded border shrink-0'
            style={{ borderColor: 'var(--border)' }}
            aria-hidden
          />
          <span className='flex-1 min-w-0'>
            <span className='flex items-center gap-2'>
              <span className='text-[14px] font-medium'>{c.glossaryTitle}</span>
              <span className='dbadge !text-[10px]'>{c.glossaryBadge}</span>
            </span>
            <span className='block text-[12px] text-ink-3 mt-0.5'>
              {c.glossaryDesc}
            </span>
          </span>
        </button>
      )}

      <div className='fixed bottom-0 left-0 right-0 bg-[var(--nav-bg)] backdrop-blur-[20px] backdrop-saturate-[180%] border-t border-border'>
        <div className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 py-4 flex items-center justify-between gap-4'>
          <span className='text-[13px] text-ink-3'>{c.eta(etaSeconds)}</span>
          <button
            type='button'
            onClick={onStart}
            className='text-white text-[15px] font-medium px-11 py-[13px] rounded-full transition active:scale-[0.98]'
            style={{ background: 'var(--ink)' }}
          >
            {c.start}
          </button>
        </div>
      </div>
    </div>
  );
}
