'use client';

import { useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { FileIcon, FilmIcon, VideoIcon } from '../icons';
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
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
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

      {/* Content type — chosen before the dropzone unlocks */}
      <div className='card qcard mb-[14px]'>
        <p className='qlabel'>{c.kindLabel}</p>
        <div className='bg-[rgba(0,0,0,0.05)] rounded-xl p-[3px] flex'>
          <button
            type='button'
            onClick={() => onContentType('movie')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-[10px] py-3 px-3 text-sm font-semibold transition ${
              contentType === 'movie'
                ? 'bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.12)] text-ink'
                : 'text-ink-3'
            }`}
          >
            <FilmIcon className='w-[18px] h-[18px]' />
            {c.kindMovie}
          </button>
          <button
            type='button'
            onClick={() => onContentType('other')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-[10px] py-3 px-3 text-sm font-semibold transition ${
              contentType === 'other'
                ? 'bg-surface shadow-[0_1px_4px_rgba(0,0,0,0.12)] text-ink'
                : 'text-ink-3'
            }`}
          >
            <VideoIcon className='w-[18px] h-[18px]' />
            {c.kindOther}
          </button>
        </div>
      </div>

      {/* Dropzone — locked (dimmed, inert to clicks/drops) until a content
          type is picked above. Dimming alone isn't a lock: both the drop
          handler and the click handler bail out while `inert`. */}
      <div
        className={`rounded-card-lg bg-surface shadow-[var(--shadow-hover)] p-[60px_40px] text-center transition${
          locked ? ' opacity-50' : ''
        }${over && !inert ? ' bg-accent-wash' : ''}${inert ? ' cursor-not-allowed' : ' cursor-pointer'}`}
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
        <div className={`drop-ico${uploading ? ' animate-zbreathe' : ''}`}>
          <FileIcon />
        </div>

        {uploading ? (
          <>
            <h3>{c.readingTitle(uploadingFileName)}</h3>
            <p>{c.readingSub}</p>
          </>
        ) : (
          <>
            <h3>{c.dropTitle}</h3>
            <p className='fmt'>{c.dropFormats}</p>
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
          </>
        )}

        {locked && <p className='fmt mt-3'>{c.dropLocked}</p>}

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

      <p className='mt-4 text-center text-[13px] text-ink-3'>{c.noVideoNeeded}</p>

      {/* Rights notice. Upload is where the copyright risk actually arises, so
          the notice lives here permanently rather than behind a consent modal. */}
      <p className='mt-3 text-center text-[12px] text-ink-3'>
        {c.rightsNotice} {c.storageNotice}{' '}
        <Link href={COPY.legal.termsHref} className='underline'>
          {COPY.legal.detail}
        </Link>
      </p>
    </div>
  );
}
