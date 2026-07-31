'use client';

import { useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { UploadIcon } from '../icons';
import { StepBreadcrumb } from '../StepBreadcrumb';
import type { ContentType } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface UploadStepProps {
  /** null before the user picks a content type — the dropzone stays locked
   *  (visually dimmed and inert to clicks/drops) until this is set. */
  contentType: ContentType | null;
  onContentType: (type: ContentType) => void;
  /** True while a just-dropped/selected file is being parsed. */
  uploading: boolean;
  /** Name of the file being read, shown in the reading-state message. */
  uploadingFileName: string;
  error: string;
  onFile: (file: File) => void;
}

export function UploadStep({
  contentType,
  onContentType,
  uploading,
  uploadingFileName,
  error,
  onFile,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const c = COPY.upload;
  const locked = contentType === null;
  const inert = locked || uploading;

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (inert) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const openPicker = () => {
    if (inert) return;
    inputRef.current?.click();
  };

  return (
    <div className='animate-zslide max-w-[760px] mx-auto'>
      <StepBreadcrumb current='upload' className='mb-[24px]' />
      <div className='head mb-[40px]'>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>

      {error && (
        <div
          className='card p-4 mb-[14px] text-sm'
          style={{ color: 'oklch(0.55 0.2 25)' }}
        >
          {error}
        </div>
      )}

      {/* Content type — chosen before the dropzone unlocks. Square check
          (brand radio motif), never a circle. */}
      <div className='flex items-center gap-[10px] mb-[18px]'>
        <p className='text-label text-secondary'>{c.kindLabel}</p>
        <p className='text-fineprint text-tertiary font-medium'>둘 중 하나를 눌러 선택하세요</p>
      </div>
      <div className='grid grid-cols-2 gap-[14px] mb-[28px]'>
        <ContentTypeCard
          selected={contentType === 'movie'}
          label={c.kindMovie}
          subLabel={c.kindMovieSub}
          onClick={() => onContentType('movie')}
        />
        <ContentTypeCard
          selected={contentType === 'other'}
          label={c.kindOther}
          subLabel={c.kindOtherSub}
          onClick={() => onContentType('other')}
        />
      </div>

      {/* Dropzone — locked (dimmed, inert to clicks/drops) until a content
          type is picked above. Dimming alone isn't a lock: both the drop
          handler and the click handler bail out while `inert`. */}
      <div
        className={`rounded-drop bg-surface shadow-drop hover:shadow-drop-hover p-[64px_40px] text-center transition ${locked ? '' : 'cursor-pointer'} ${over && !inert ? ' bg-accent-wash' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!inert) setOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setOver(false);
        }}
        onDrop={handleDrop}
        onClick={openPicker}
        role='button'
        tabIndex={inert ? -1 : 0}
        aria-disabled={locked}
        onKeyDown={(e) => {
          if (inert) return;
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <div className={`drop-ico${uploading ? ' animate-zbreathe' : ''}`} style={{ color: locked ? 'var(--text-tertiary)' : 'var(--ink)' }}>
          <UploadIcon strokeWidth={locked ? 1.2 : 1.6} />
        </div>

        {uploading ? (
          <>
            <h3 className='text-lead font-semibold text-ink mb-2'>{c.readingTitle(uploadingFileName)}</h3>
            <p className='text-body text-nav mb-0'>{c.readingSub}</p>
          </>
        ) : (
          <>
            <h3 className={`text-lead font-semibold mb-2 ${locked ? 'text-tertiary' : 'text-ink'}`}>{c.dropTitle}</h3>
            <p className={`text-caption mb-[22px] ${locked ? 'text-quaternary' : 'text-tertiary'}`}>{c.dropFormats}</p>
            
            {locked ? (
              <p className='text-caption text-tertiary mt-[28px]'>{c.dropLocked}</p>
            ) : (
              <button
                type='button'
                className='btn btn-primary btn-lg mt-3'
                disabled={locked}
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
              >
                {c.dropButton}
              </button>
            )}
          </>
        )}

        <input
          ref={inputRef}
          type='file'
          accept='.srt,.vtt,.smi,.sami,.ass,.ssa'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (inert || !file) return;
            onFile(file);
          }}
        />
      </div>

      <div className='mt-[20px] flex flex-col gap-2'>
        <p className='text-caption-sm text-quaternary font-medium'>{c.noVideoNeeded}</p>
        <p className='text-fineprint text-quaternary'>
          {c.rightsNotice} {c.storageNotice}{' '}
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.detail}
          </Link>
        </p>
      </div>
    </div>
  );
}

function ContentTypeCard({
  selected,
  label,
  subLabel,
  onClick,
}: {
  selected: boolean;
  label: string;
  subLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex items-start gap-3 bg-surface rounded-card p-[18px_20px] text-left border-[1.5px] transition hover:shadow-[var(--shadow-hover)] active:scale-[0.985]'
      style={{
        borderColor: selected ? 'var(--ink-strong)' : 'var(--border-card)',
        boxShadow: selected ? 'var(--shadow-hover)' : 'var(--shadow-card)',
      }}
    >
      <span className={`zcheck shrink-0 w-5 h-5 mt-[2px]${selected ? ' on' : ''}`}>
        {selected && (
          <span className='text-mono-step font-bold leading-none'>✓</span>
        )}
      </span>
      <div className='flex-1'>
        <div className='flex items-center gap-[6px] mb-1'>
          <span className='text-title-sm text-ink'>{label}</span>
        </div>
        <div className='text-caption text-tertiary'>{subLabel}</div>
      </div>
    </button>
  );
}
