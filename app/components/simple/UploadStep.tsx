'use client';

import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '../icons';
import { StepBreadcrumb } from '../StepBreadcrumb';
import type { ContentType } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface UploadStepProps {
  contentType: ContentType | null;
  onContentType: (type: ContentType) => void;
  /** True while a just-dropped/selected file is being parsed. */
  uploading: boolean;
  /** Name of the file being read, shown in the reading-state message. */
  uploadingFileName: string;
  /** Name of the successfully parsed file. */
  fileName?: string;
  error: string;
  onFile: (file: File) => void;
  onNext: () => void;
}

export function UploadStep({
  contentType,
  onContentType,
  uploading,
  uploadingFileName,
  fileName,
  error,
  onFile,
  onNext,
}: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const c = COPY.upload;
  const inert = uploading;
  const canProceed = contentType !== null && !!fileName;

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
    <>
    <div className='animate-zslide max-w-[760px] mx-auto pb-28'>
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

      {/* Content type — chosen before the dropzone unlocks. */}
      <div className='flex items-center gap-[10px] mb-[18px]'>
        <p className='text-label text-secondary'>{c.kindLabel}</p>
        <p className='text-fineprint text-tertiary font-medium'>{c.kindHint}</p>
      </div>
      {/* 유형은 정보 수집 분기만 고르는 게 아니라 읽기 속도 프로필까지 고른다
          — `config/languages.ts`의 `shapes`. 다큐멘터리는 영화 프로필에 얹는다
          (카드 4장은 업로드 화면을 퀴즈로 만든다, `decisions.md` §1-19). */}
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-[14px] mb-[28px]'>
        <ContentTypeCard
          selected={contentType === 'movie'}
          label={c.kindMovie}
          onClick={() => onContentType('movie')}
        />
        <ContentTypeCard
          selected={contentType === 'variety'}
          label={c.kindVariety}
          onClick={() => onContentType('variety')}
        />
        <ContentTypeCard
          selected={contentType === 'talk'}
          label={c.kindTalk}
          onClick={() => onContentType('talk')}
        />
      </div>

      {/* Dropzone — always unlocked so users can upload files before picking a type. */}
      <div
        className={`rounded-drop bg-surface shadow-drop hover:shadow-drop-hover p-[64px_40px] text-center transition cursor-pointer ${over && !inert ? ' bg-accent-wash' : ''}`}
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
        onKeyDown={(e) => {
          if (inert) return;
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <div className={`drop-ico${uploading ? ' animate-zbreathe' : ''}`} style={{ color: 'var(--ink)' }}>
          <UploadIcon strokeWidth={1.25} />
        </div>

        {uploading ? (
          <>
            <h3 className='text-lead font-semibold text-ink mb-2'>{c.readingTitle(uploadingFileName)}</h3>
            <p className='text-body text-nav mb-0'>{c.readingSub}</p>
          </>
        ) : fileName ? (
          <>
            <h3 className='text-lead font-semibold text-ink mb-2'>{fileName}</h3>
            <p className='text-caption text-tertiary mb-[22px]'>{c.fileReady}</p>
            <button
              type='button'
              className='btn btn-secondary btn-lg mt-3'
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
            >
              {c.changeFile}
            </button>
          </>
        ) : (
          <>
            <h3 className='text-lead font-semibold text-ink mb-2'>{c.dropTitle}</h3>
            <p className='text-caption text-tertiary mb-[22px]'>{c.dropFormats}</p>
            <button
              type='button'
              className='btn btn-primary btn-lg mt-3'
              onClick={(e) => {
                e.stopPropagation();
                openPicker();
              }}
            >
              {c.dropButton}
            </button>
          </>
        )}

        {/* ⚠️ `accept`를 다시 붙이지 말 것 — 폰에서 자막을 아예 못 고르게 된다.
            iOS는 `accept`의 확장자를 UTI로 바꿔서 거는데 `.srt`·`.smi`·`.ass`는
            등록된 UTI가 없다. 그래서 파일 앱이 **모든 파일을 회색으로** 만들어
            버린다 — 걸러주는 게 아니라 업로드 자체가 막힌다.

            거르는 일은 `inspectUpload`가 이미 한다(확장자 → 파싱 → 타이밍 →
            크기 순). 잘못 고른 파일은 드롭존 옆에 이유가 뜨므로, 데스크톱이
            잃는 건 피커의 회색 처리뿐이고 모바일은 제품을 되찾는다.
            `decisions.md` §1-22. */}
        <input
          ref={inputRef}
          type='file'
          className='hidden'
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (inert || !file) return;
            onFile(file);
          }}
        />
      </div>

      <div className='mt-[20px]'>
        <p className='text-caption-sm text-quaternary font-medium'>{c.noVideoNeeded}</p>
      </div>
    </div>

      {/* Outside animate-zslide: a transform ancestor becomes a backdrop root
          and clips fixed positioning, which kills the glass blur. */}
      <div className='fixed bottom-0 left-0 right-0 z-40 flex justify-center p-4 glass-nav glass-bar backdrop-blur-[20px] backdrop-saturate-[180%]'>
        <button
          type='button'
          disabled={!canProceed}
          onClick={onNext}
          className='text-white text-card-title font-medium px-11 py-[13px] rounded-[var(--r-btn)] transition active:scale-[0.97] disabled:cursor-default'
          style={{ background: canProceed ? 'var(--ink-strong)' : 'var(--ink-disabled)' }}
        >
          {c.next}
        </button>
      </div>
    </>
  );
}

function ContentTypeCard({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
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
      <span
        className={`zcheck shrink-0 w-5 h-5 mt-[2px] rounded-full${selected ? ' on' : ''}`}
      >
        {selected && (
          <span className='text-mono-step font-bold leading-none'>✓</span>
        )}
      </span>
      <div className='flex-1'>
        <div className='flex items-center gap-[6px]'>
          <span className='text-title-sm text-ink'>{label}</span>
        </div>
      </div>
    </button>
  );
}
