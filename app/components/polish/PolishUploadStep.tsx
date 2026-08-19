'use client';

import { COPY } from '../../i18n/simpleCopy';

interface PolishUploadStepProps {
  working: boolean;
  error: string;
  onFile: (file: File) => void;
}

/**
 * 파일 드롭만 있다.
 *
 * 콘텐츠 유형(영화·예능·강연) 선택이 필요했던 유일한 이유가 CPS 타이밍의
 * `shapes`였는데 이 경로는 타임코드를 안 건드린다 — 그래서 고를 것이 없다.
 */
export function PolishUploadStep({
  working,
  error,
  onFile,
}: PolishUploadStepProps) {
  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{COPY.polish.title}</h1>
        <p className='whitespace-pre-line'>{COPY.polish.sub}</p>
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {error && (
          <p className='text-sm text-center' style={{ color: 'oklch(0.55 0.2 25)' }}>
            {error}
          </p>
        )}

        <label
          className={`btn btn-primary w-full text-center ${
            working ? 'opacity-60' : 'cursor-pointer'
          }`}
        >
          {working ? COPY.polish.working : COPY.polish.dropButton}
          <input
            type='file'
            accept='.srt,.vtt,.ass,.smi'
            className='hidden'
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              // 같은 파일을 다시 골라도 change가 뜨도록 비운다.
              event.target.value = '';
            }}
          />
        </label>

        <p className='text-fineprint text-secondary'>
          {COPY.polish.dropFormats}
        </p>
      </div>
    </div>
  );
}
