'use client';

import { useState, type ReactNode } from 'react';
import { SpinnerIcon, SparkleIcon, PencilIcon } from '../icons';
import { CastSheetCard } from './CastSheetCard';
import type { EnrichCandidate, EnrichStatus } from '../../hooks/useEnrich';
import type { CastSheetStatus } from '../../hooks/useCastSheet';
import type { CastSheet } from '../../types/glossary';
import type { ContentType, MovieInfo } from '../../types/translation';
import {
  FLASH_MODEL,
  PRO_MODEL,
  type AllowedModel,
} from '../../config/constants';
import { COPY } from '../../i18n/simpleCopy';

interface InfoStepProps {
  contentType: ContentType;
  movieInfo: MovieInfo;
  setMovieInfo: React.Dispatch<React.SetStateAction<MovieInfo>>;
  // movie branch (enrich lifecycle owned by the orchestrator so it survives
  // step navigation — no re-search when returning from a failed translate)
  enrichStatus: EnrichStatus;
  /** Non-empty when the search failed rather than found nothing. */
  enrichError: string;
  director: string;
  /** Present when enrichStatus === 'ambiguous' — the TMDB matches to pick from. */
  candidates: EnrichCandidate[];
  onSelectCandidate: (candidate: EnrichCandidate) => void;
  analysisAnalyzing: boolean;
  onReEnrich: () => void;
  // other branch
  summarizing: boolean;
  // cast sheet — independent toggle from the translation model, shared by
  // both branches (see docs/decisions.md)
  castSheetEnabled: boolean;
  onCastSheetToggle: (value: boolean) => void;
  castSheetStatus: CastSheetStatus;
  castSheet: CastSheet;
  onCastSheetChange: (sheet: CastSheet) => void;
  onCastSheetRefetch: () => void;
  /** Optional content rendered just above the action buttons. */
  beforeActions?: ReactNode;
  onBack: () => void;
  onTranslate: (model: AllowedModel) => void;
}

const c = COPY.info;

export function InfoStep(props: InfoStepProps) {
  return props.contentType === 'movie' ? (
    <MovieInfo {...props} />
  ) : (
    <OtherInfo {...props} />
  );
}

/* ---------------------------------------------------------------- movie ---- */

function MovieInfo({
  movieInfo,
  setMovieInfo,
  enrichStatus,
  enrichError,
  director,
  candidates,
  onSelectCandidate,
  analysisAnalyzing,
  onReEnrich,
  castSheetEnabled,
  onCastSheetToggle,
  castSheetStatus,
  castSheet,
  onCastSheetChange,
  onCastSheetRefetch,
  beforeActions,
  onBack,
  onTranslate,
}: InfoStepProps) {
  const [editing, setEditing] = useState(false);

  const busy =
    analysisAnalyzing || enrichStatus === 'searching' || enrichStatus === 'idle';
  const inputMode = editing || enrichStatus === 'notFound';
  const awaitingSelection = !editing && enrichStatus === 'ambiguous';

  const handleReEnrich = () => {
    setEditing(false);
    onReEnrich();
  };

  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{c.movieTitle}</h1>
        <p>{c.movieSubtitle}</p>
      </div>

      {busy ? (
        <Loading text={analysisAnalyzing ? c.analyzing : c.searching} />
      ) : awaitingSelection ? (
        <CandidatePicker candidates={candidates} onSelect={onSelectCandidate} />
      ) : inputMode ? (
        <div className='card p-[18px] mb-4'>
          {enrichStatus === 'notFound' && !editing && (
            <div
              className='dbadge mb-3'
              style={{ color: 'var(--ink-3)', background: 'var(--surface-2)' }}
            >
              {c.notFoundBadge}
            </div>
          )}
          {/* Why it failed, when it failed. Manual input below still works, so
              this informs rather than blocks. */}
          {enrichError && !editing && (
            <p className='text-[13px] mb-3' style={{ color: 'oklch(0.55 0.2 25)' }}>
              {`${c.enrichFailed} (${enrichError})`}
            </p>
          )}
          <p className='text-[13px] text-ink-3 mb-3'>{c.notFoundHint}</p>
          <div className='frow'>
            <div className='field !mb-0'>
              <label>{c.labelTitle}</label>
              <input
                className='input'
                value={movieInfo.title}
                onChange={(e) =>
                  setMovieInfo((p) => ({ ...p, title: e.target.value }))
                }
              />
            </div>
            <div className='field !mb-0'>
              <label>{c.labelYear}</label>
              <input
                className='input'
                value={movieInfo.year}
                onChange={(e) =>
                  setMovieInfo((p) => ({ ...p, year: e.target.value }))
                }
              />
            </div>
          </div>
          <div className='flex gap-2 mt-4'>
            <button
              type='button'
              className='btn btn-primary'
              disabled={!movieInfo.title.trim()}
              onClick={handleReEnrich}
            >
              {c.research}
            </button>
            {editing && (
              <button
                type='button'
                className='btn btn-ghost'
                onClick={() => setEditing(false)}
              >
                {c.cancel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className='card detected'>
          <div className='poster'>
            {movieInfo.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={movieInfo.posterUrl}
                alt={c.posterAlt(movieInfo.title || '')}
                className='w-full h-full object-cover'
              />
            ) : (
              <span>{c.posterEmpty}</span>
            )}
          </div>
          <div className='min-w-0'>
            <div className='dtitle truncate'>{movieInfo.title || '—'}</div>
            <div className='dmeta'>
              {[movieInfo.year, director].filter(Boolean).join(' · ') || '—'}
            </div>
            <div className='dbadge'>
              <b />
              {c.detectedBadge}
            </div>
          </div>
          <button
            type='button'
            className='btn btn-ghost ml-auto self-start !px-3 !py-2 !text-[13px]'
            onClick={() => setEditing(true)}
          >
            <PencilIcon />
            {c.edit}
          </button>
        </div>
      )}

      {!busy && !awaitingSelection && (
        <div className='mt-6'>
          <p className='text-[12px] text-ink-3 mb-2'>{c.aiInfoHint}</p>
          <div className='frow'>
            <div className='field !mb-0'>
              <label>{c.genreLabel}</label>
              <input
                className='input'
                value={movieInfo.genre ?? ''}
                onChange={(e) =>
                  setMovieInfo((p) => ({ ...p, genre: e.target.value }))
                }
              />
            </div>
            <div className='field !mb-0'>
              <label>{c.eraLabel}</label>
              <input
                className='input'
                value={movieInfo.era ?? ''}
                onChange={(e) =>
                  setMovieInfo((p) => ({ ...p, era: e.target.value }))
                }
              />
            </div>
          </div>
          <div className='field mt-3'>
            <label>{c.toneLabel}</label>
            <input
              className='input'
              value={movieInfo.tone ?? ''}
              onChange={(e) =>
                setMovieInfo((p) => ({ ...p, tone: e.target.value }))
              }
            />
          </div>
        </div>
      )}

      {!busy && !awaitingSelection && (
        <div className='field mt-4'>
          <label>{c.notesLabel}</label>
          <p className='text-[12px] text-ink-3 mb-2'>{c.notesHint}</p>
          <textarea
            className='input'
            rows={8}
            value={movieInfo.notes}
            onChange={(e) =>
              setMovieInfo((p) => ({ ...p, notes: e.target.value }))
            }
          />
        </div>
      )}

      {!busy && !awaitingSelection && (
        <CastSheetCard
          enabled={castSheetEnabled}
          onToggle={onCastSheetToggle}
          status={castSheetStatus}
          sheet={castSheet}
          onChangeSheet={onCastSheetChange}
          onRefetch={onCastSheetRefetch}
        />
      )}

      {!busy && !awaitingSelection && beforeActions}
      <Actions
        onBack={onBack}
        onTranslate={onTranslate}
        disabled={busy || awaitingSelection}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- other ---- */

function OtherInfo({
  movieInfo,
  setMovieInfo,
  summarizing,
  castSheetEnabled,
  onCastSheetToggle,
  castSheetStatus,
  castSheet,
  onCastSheetChange,
  onCastSheetRefetch,
  beforeActions,
  onBack,
  onTranslate,
}: InfoStepProps) {
  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{c.otherTitle}</h1>
        <p>{c.otherSubtitle}</p>
      </div>

      {summarizing ? (
        <Loading text={c.summarizing} />
      ) : (
        <div className='card p-[18px] mb-4'>
          <div className='dbadge mb-3'>
            <SparkleIcon className='w-3.5 h-3.5' />
            {c.summaryBadge}
          </div>
          <textarea
            className='input'
            rows={5}
            placeholder={c.otherNotesHint}
            value={movieInfo.notes}
            onChange={(e) =>
              setMovieInfo((p) => ({ ...p, notes: e.target.value }))
            }
          />
        </div>
      )}

      {!summarizing && (
        <CastSheetCard
          enabled={castSheetEnabled}
          onToggle={onCastSheetToggle}
          status={castSheetStatus}
          sheet={castSheet}
          onChangeSheet={onCastSheetChange}
          onRefetch={onCastSheetRefetch}
        />
      )}

      {!summarizing && beforeActions}
      <Actions onBack={onBack} onTranslate={onTranslate} disabled={summarizing} />
    </div>
  );
}

/* -------------------------------------------------------- candidate picker ---- */

function CandidatePicker({
  candidates,
  onSelect,
}: {
  candidates: EnrichCandidate[];
  onSelect: (candidate: EnrichCandidate) => void;
}) {
  return (
    <div className='card p-[18px] mb-4'>
      <p className='text-[13px] text-ink-3 mb-3'>{c.ambiguousHint}</p>
      <div className='flex flex-col gap-1'>
        {candidates.map((candidate) => (
          <button
            key={`${candidate.mediaType}-${candidate.tmdbId}`}
            type='button'
            className='flex gap-3 text-left items-start p-2 rounded-lg transition-colors hover:bg-[var(--surface-2)]'
            onClick={() => onSelect(candidate)}
          >
            <div className='poster !w-[46px] !h-[64px]'>
              {candidate.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={candidate.posterUrl}
                  alt={c.posterAlt(candidate.title)}
                  className='w-full h-full object-cover'
                />
              ) : (
                <span>{c.posterEmpty}</span>
              )}
            </div>
            <div className='min-w-0'>
              <div className='dtitle truncate !text-[14px]'>{candidate.title}</div>
              <div className='dmeta !text-[12px]'>
                {[
                  candidate.year,
                  candidate.mediaType === 'movie'
                    ? c.mediaTypeMovie
                    : c.mediaTypeTv,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {candidate.overview && (
                <p className='text-[12px] text-ink-3 mt-1 line-clamp-2'>
                  {candidate.overview}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- shared ---- */

function Loading({ text }: { text: string }) {
  return (
    <div className='card p-6 flex items-center gap-3 mb-4'>
      <SpinnerIcon className='w-5 h-5 text-accent' />
      <span className='text-sm text-ink-2'>{text}</span>
    </div>
  );
}

function Actions({
  onBack,
  onTranslate,
  disabled,
}: {
  onBack: () => void;
  onTranslate: (model: AllowedModel) => void;
  disabled: boolean;
}) {
  return (
    <div className='flex gap-2 mt-2'>
      <button type='button' className='btn btn-ghost' onClick={onBack}>
        {c.back}
      </button>
      <button
        type='button'
        className='btn btn-primary flex-1'
        disabled={disabled}
        onClick={() => onTranslate(PRO_MODEL)}
      >
        {c.translatePro}
      </button>
      <button
        type='button'
        className='btn btn-ghost flex-1'
        disabled={disabled}
        onClick={() => onTranslate(FLASH_MODEL)}
      >
        {c.translateFlash}
      </button>
    </div>
  );
}
