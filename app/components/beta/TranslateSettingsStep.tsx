'use client';

import { PencilIcon, SpinnerIcon } from '../icons';
import { StepBreadcrumb } from '../StepBreadcrumb';
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
  { model: FLASH_MODEL, name: c.liteName, desc: [c.liteDesc, c.liteDescSpeed] },
  { model: PRO_MODEL, name: c.proName, desc: [c.proDesc] },
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

      {/* 'other' has no TMDB card, so its "what is this" surface is the
          auto-written summary /api/summarize put into movieInfo.notes. That
          value ships to the prompt as <user_notes>, and notes is by invariant
          사용자 자유 입력 전용 (CLAUDE.md) — so it must stay visible and
          editable rather than being machine-written behind the user's back. */}
      {contentType === 'other' && (
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

      <p className='qlabel'>{c.sectionQuality}</p>

      <div className='grid grid-cols-2 gap-[14px] mb-[14px]'>
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
              {card.desc.map((line) => (
                <p
                  key={line}
                  className='mt-2 text-caption text-secondary leading-[1.5]'
                >
                  {line}
                </p>
              ))}
            </button>
          );
        })}
      </div>

      <p className='qlabel'>{c.sectionAdvanced}</p>

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
          className='card w-full flex items-center justify-between gap-3 p-[18px_24px] text-left mb-[14px]'
          onClick={() => onCastSheetToggle(true)}
        >
          <span className='flex-1 min-w-0'>
            <span className='flex items-center gap-2'>
              <span className='text-title-sm font-semibold tracking-[-0.01em]'>
                {c.glossaryTitle}
              </span>
              <span className='dbadge-pro'>{c.glossaryBadge}</span>
            </span>
            <span className='block text-caption-sm text-tertiary mt-0.5'>
              {c.glossaryDesc}
            </span>
          </span>
          <span className='ztoggle' aria-hidden>
            <span className='ztoggle-knob' />
          </span>
        </button>
      )}

      <div className='fixed bottom-0 left-0 right-0 glass-nav border-t border-border-subtle'>
        <div className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 py-4 flex items-center justify-center gap-4'>
          <span className='text-caption text-tertiary'>{c.eta(etaSeconds)}</span>
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
    </div>
  );
}
