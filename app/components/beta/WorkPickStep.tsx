'use client';

import { useState } from 'react';
import { SpinnerIcon, ArrowRightIcon } from '../icons';
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
    <div className='animate-fade-slide-up pb-28'>
      <div className='head text-center mb-2'>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>
      <div className='flex items-center justify-center gap-2 mb-7 text-[12px] text-ink-3'>
        <span className='mono truncate max-w-[220px]'>{fileName}</span>
        <span className='dot-sep' />
        <span>{c.sourceLangBadge}</span>
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

      <div className='fixed bottom-0 left-0 right-0 flex justify-center p-4 bg-[var(--nav-bg)] backdrop-blur-[20px] backdrop-saturate-[180%] border-t border-border'>
        <button
          type='button'
          disabled={!canConfirm}
          onClick={onConfirm}
          className='text-white text-[15px] font-medium px-11 py-[13px] rounded-full transition active:scale-[0.98] disabled:cursor-default'
          style={{ background: canConfirm ? 'var(--ink)' : '#c7c7cc' }}
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
          <span className='text-sm text-ink-2'>{COPY.info.searching}</span>
        </div>
      ) : (
        <div className='flex flex-col gap-2.5 mb-4'>
          {candidates.map((candidate, i) => (
            <CandidateCard
              key={`${candidate.mediaType}-${candidate.tmdbId}`}
              c={candidate}
              selected={i === selectedIndex}
              onSelect={() => onSelect(i)}
            />
          ))}
        </div>
      )}

      <div className='text-center'>
        <button
          type='button'
          className='text-[13px] text-ink-3 underline'
          onClick={() => setSearchOpen((v) => !v)}
        >
          {searchOpen ? c.searchClose : c.searchOpen}
        </button>
      </div>

      {searchOpen && (
        <div className='card p-[18px] mt-3'>
          <p className='text-[13px] text-ink-3 mb-3'>{c.searchHint}</p>
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
}: {
  c: EnrichCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className='flex gap-[18px] items-center w-full text-left rounded-card p-4 px-5 border-[1.5px] transition hover:shadow-[var(--shadow-hover)]'
      style={{
        background: selected ? 'var(--accent-wash)' : 'var(--surface)',
        borderColor: selected ? 'var(--ink)' : 'transparent',
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
        <div className='w-14 h-20 rounded-lg flex-none bg-surface-2 flex items-center justify-center mono text-[9px] text-ink-5'>
          {c.posterEmpty}
        </div>
      )}
      <div className='flex-1 min-w-0'>
        <div className='text-[16px] font-semibold tracking-[-0.01em] truncate'>
          {candidate.title}
        </div>
        <div className='text-[13px] text-ink-3 mt-[3px]'>
          {candidate.year}
          {' · '}
          {candidate.mediaType === 'tv' ? c.kindTv : c.kindMovie}
        </div>
        {candidate.overview && (
          <div className='text-[12.5px] text-ink-4 mt-1.5 line-clamp-2'>
            {candidate.overview}
          </div>
        )}
      </div>
      <div
        className='w-[22px] h-[22px] rounded-full flex-none border-[1.5px] flex items-center justify-center text-white text-[12px]'
        style={{
          borderColor: selected ? 'var(--ink)' : 'var(--border-strong)',
          background: selected ? 'var(--ink)' : 'var(--surface)',
        }}
      >
        {selected ? '✓' : ''}
      </div>
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
            className='rounded-full px-4 py-2 text-[13.5px] font-medium border-[1.5px] transition'
            style={{
              background: otherType === type ? 'var(--accent-wash)' : 'var(--surface)',
              borderColor: otherType === type ? 'var(--ink)' : 'var(--border-strong)',
              color: 'var(--ink)',
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
