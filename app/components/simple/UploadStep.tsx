'use client';

import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon, FilmIcon, VideoIcon, ArrowRightIcon } from '../icons';
import { LanguageSelect } from './LanguageSelect';
import type { ContentType } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface UploadStepProps {
  targetLang: string;
  onTargetLang: (code: string) => void;
  contentType: ContentType;
  onContentType: (type: ContentType) => void;
  error: string;
  onFile: (file: File) => void;
}

export function UploadStep({
  targetLang,
  onTargetLang,
  contentType,
  onContentType,
  error,
  onFile,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const c = COPY.upload;

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
      </div>

      {/* Content type — above the dropzone */}
      <div className='card qcard mb-[14px]'>
        <p className='qlabel'>{c.typeLabel}</p>
        <div className='seg'>
          <button
            type='button'
            onClick={() => onContentType('movie')}
            className={`segbtn${contentType === 'movie' ? ' on' : ''}`}
          >
            <FilmIcon />
            {c.typeMovie}
          </button>
          <button
            type='button'
            onClick={() => onContentType('other')}
            className={`segbtn${contentType === 'other' ? ' on' : ''}`}
          >
            <VideoIcon />
            {c.typeOther}
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role='button'
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <div className='drop-ico'>
          <UploadIcon />
        </div>
        <h3>{c.dropTitle}</h3>
        <p>{c.dropOr}</p>
        <button
          type='button'
          className='btn btn-primary btn-lg'
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {c.browse}
        </button>
        <p className='fmt'>{c.formats}</p>
        <input
          ref={inputRef}
          type='file'
          accept='.srt'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p className='text-center text-sm mt-3' style={{ color: 'oklch(0.6 0.2 25)' }}>
          {error}
        </p>
      )}

      {/* Target language — chromeless "detected → target" flow */}
      <div className='langflow'>
        <span className='langflow-src'>{c.langDetect}</span>
        <ArrowRightIcon className='langflow-arrow' />
        <LanguageSelect value={targetLang} onChange={onTargetLang} />
      </div>

      {/* Reassurance */}
      <div className='reassure'>
        {c.reassure.map((item, i) => (
          <span key={item} className='flex items-center gap-2'>
            {i > 0 && <span className='dot-sep' />}
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
