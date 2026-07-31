'use client';

import { useState } from 'react';
import { SpinnerIcon, ArrowRightIcon } from '../icons';
import { StepBreadcrumb } from '../StepBreadcrumb';
import type { EnrichCandidate } from '../../hooks/useEnrich';
import type { ContentType } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface WorkPickStepProps {
  contentType: ContentType;
  fileName: string;
  // movie branch
  candidates: EnrichCandidate[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onSearch: (q: string) => void;
  searching: boolean;
  // other branch
  otherType: string;
  onOtherType: (t: string) => void;
  toneText: string;
  onToneText: (t: string) => void;
  // shared
  onConfirm: () => void;
}

const c = COPY.workPick;

export function WorkPickStep({
  contentType,
  fileName,
  candidates,
  selectedIndex,
  onSelect,
  onSearch,
  searching,
  otherType,
  onOtherType,
  toneText,
  onToneText,
  onConfirm,
}: WorkPickStepProps) {
  const canConfirm =
    contentType === 'movie'
      ? selectedIndex >= 0 && selectedIndex < candidates.length
      : true;

  return (
    <div className='animate-zslide pb-28 max-w-[760px] mx-auto'>
      <StepBreadcrumb current='settings' className='mb-6' />
      <div className='flex items-center gap-2 mb-[6px] text-fineprint text-secondary'>
        <span className='mono bg-surface border border-border-chip rounded-[var(--r-btn)] px-3 py-[5px] truncate max-w-[220px]'>
          {fileName}
        </span>
        <span className='bg-surface border border-border-chip rounded-[var(--r-btn)] px-3 py-[5px] font-medium'>
          {c.sourceLangBadge}
        </span>
      </div>
      <div className='head mb-7'>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>

      {contentType === 'movie' ? (
        <MovieBranch
          candidates={candidates}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          onSearch={onSearch}
          searching={searching}
        />
      ) : (
        <OtherBranch
          otherType={otherType}
          onOtherType={onOtherType}
          toneText={toneText}
          onToneText={onToneText}
        />
      )}

      <div className='fixed bottom-0 left-0 right-0 flex justify-center p-4 glass-nav border-t border-border-subtle'>
        <button
          type='button'
          disabled={!canConfirm}
          onClick={onConfirm}
          className='text-white text-card-title font-medium px-11 py-[13px] rounded-[var(--r-btn)] transition active:scale-[0.97] disabled:cursor-default'
          style={{ background: canConfirm ? 'var(--ink-strong)' : 'var(--ink-disabled)' }}
        >
          {c.confirm}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- movie ---- */

function MovieBranch({
  candidates,
  selectedIndex,
  onSelect,
  onSearch,
  searching,
}: {
  candidates: EnrichCandidate[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  onSearch: (q: string) => void;
  searching: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const submitSearch = () => {
    if (!query.trim()) return;
    onSearch(query.trim());
  };

  return (
    <div>
      {searching ? (
        <div className='card p-6 flex items-center gap-3 mb-4'>
          <SpinnerIcon className='w-5 h-5 text-accent' />
          <span className='text-sm text-nav'>{COPY.info.searching}</span>
        </div>
      ) : (
        <div className='flex flex-col gap-2.5 mb-4'>
          {candidates.map((candidate, i) => (
            <CandidateCard
              key={`${candidate.mediaType}-${candidate.tmdbId}`}
              c={candidate}
              selected={i === selectedIndex}
              onSelect={() => onSelect(i)}
              delayMs={i * 60}
            />
          ))}
        </div>
      )}

      <div className='text-center'>
        <button
          type='button'
          className='text-body text-ink-strong'
          onClick={() => setSearchOpen((v) => !v)}
        >
          {searchOpen ? c.searchClose : c.searchOpen}
        </button>
      </div>

      {searchOpen && (
        <div className='card p-[18px] mt-3'>
          <p className='text-caption text-secondary mb-3'>{c.searchHint}</p>
          <div className='flex gap-2'>
            <input
              className='input flex-1'
              placeholder={c.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
              }}
            />
            <button
              type='button'
              className='btn btn-primary !px-4'
              disabled={!query.trim()}
              onClick={submitSearch}
              aria-label={c.searchOpen}
            >
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  c: candidate,
  selected,
  onSelect,
  delayMs,
}: {
  c: EnrichCandidate;
  selected: boolean;
  onSelect: () => void;
  delayMs: number;
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className='animate-zslide flex gap-[18px] items-center w-full text-left rounded-card p-4 px-5 border-[1.5px] transition hover:shadow-[var(--shadow-hover)] active:scale-[0.99]'
      style={{
        background: selected ? 'var(--accent-wash)' : 'var(--surface)',
        borderColor: selected ? 'var(--ink-strong)' : 'transparent',
        animationDelay: `${delayMs}ms`,
        animationFillMode: 'both',
      }}
    >
      {candidate.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={candidate.posterUrl}
          alt=''
          className='w-14 h-20 rounded-lg flex-none object-cover'
        />
      ) : (
        <div className='w-14 h-20 rounded-poster flex-none bg-[image:var(--placeholder-stripe)] flex items-center justify-center mono text-micro text-quaternary'>
          {c.posterEmpty}
        </div>
      )}
      <div className='flex-1 min-w-0'>
        <div className='text-card-title text-ink truncate'>
          {candidate.title}
        </div>
        <div className='text-caption text-secondary mt-[3px]'>
          {candidate.year}
          {' · '}
          {candidate.mediaType === 'tv' ? c.kindTv : c.kindMovie}
        </div>
        {candidate.overview && (
          <div className='text-caption-sm text-tertiary mt-1.5 line-clamp-2'>
            {candidate.overview}
          </div>
        )}
      </div>
      <span className={`zcheck w-[22px] h-[22px] rounded-[6px] text-fineprint font-bold${selected ? ' on' : ''}`}>
        {selected ? '✓' : ''}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- other ---- */

function OtherBranch({
  otherType,
  onOtherType,
  toneText,
  onToneText,
}: {
  otherType: string;
  onOtherType: (t: string) => void;
  toneText: string;
  onToneText: (t: string) => void;
}) {
  return (
    <div className='card p-[18px]'>
      <p className='qlabel'>{c.otherTypeLabel}</p>
      <div className='flex flex-wrap gap-2 mb-5'>
        {c.otherTypes.map((type) => (
          <button
            key={type}
            type='button'
            onClick={() => onOtherType(type)}
            className='rounded-[var(--r-btn)] px-4 py-2 text-caption font-medium border-[1.5px] transition'
            style={{
              background: otherType === type ? 'var(--accent-wash)' : 'var(--surface)',
              borderColor: otherType === type ? 'var(--ink-strong)' : 'var(--border-step)',
              color: 'var(--ink-strong)',
            }}
          >
            {type}
          </button>
        ))}
      </div>

      <div className='field !mb-0'>
        <label>{c.toneLabel}</label>
        <textarea
          className='input'
          rows={4}
          placeholder={c.tonePlaceholder}
          value={toneText}
          onChange={(e) => onToneText(e.target.value)}
        />
      </div>
    </div>
  );
}
