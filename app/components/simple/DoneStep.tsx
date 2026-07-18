'use client';

import { CheckIcon, FileIcon, DownloadIcon } from '../icons';
import { downloadFile } from '../../utils/downloadFile';
import { parseSrtBlocks } from '../../lib/srt';
import type { TranslationResult } from '../../types/translation';
import { COPY } from '../../i18n/simpleCopy';

interface DoneStepProps {
  result: TranslationResult;
  originalContent: string;
  onStartOver: () => void;
}

const c = COPY.done;

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/** Body text (lines after number + timing) of the first `n` SRT blocks. */
function previewBodies(content: string, n: number): string[] {
  return parseSrtBlocks(content)
    .slice(0, n)
    .map((block) => block.split('\n').slice(2).join(' ').trim())
    .filter(Boolean);
}

export function DoneStep({ result, originalContent, onStartOver }: DoneStepProps) {
  const time = formatDuration(result.durationMs);
  const originals = previewBodies(originalContent, 3);
  const translations = previewBodies(result.content, 3);
  const rows = originals.slice(0, translations.length);

  return (
    <div className='animate-fade-slide-up'>
      <div className='text-center mb-2'>
        <div className='bigcheck'>
          <CheckIcon />
        </div>
        <div className='head'>
          <h1>{c.title}</h1>
          <p>{c.subtitle(result.lineCount, time)}</p>
        </div>
      </div>

      {/* Partial-failure notice — some chunks kept their original text */}
      {result.failedChunks ? (
        <div
          className='card p-4 mt-6 text-[13px] leading-relaxed'
          style={{
            color: 'oklch(0.5 0.13 75)',
            background: 'oklch(0.97 0.03 85)',
          }}
        >
          {c.partialWarning(result.failedChunks)}
        </div>
      ) : null}

      {/* Download card */}
      <div className='card dl-card mt-6'>
        <div className='dl-file'>
          <FileIcon />
          <span className='nm'>{result.filename}</span>
        </div>
        <button
          type='button'
          className='btn btn-primary btn-block'
          onClick={() => downloadFile(result.content, result.filename)}
        >
          <DownloadIcon />
          {c.download}
        </button>
      </div>

      {/* Summary */}
      <div className='sumrow'>
        <div className='sum'>
          <div className='v mono'>{result.lineCount.toLocaleString()}</div>
          <div className='k'>{c.summaryLines}</div>
        </div>
        <div className='sum'>
          <div className='v mono'>{time}</div>
          <div className='k'>{c.summaryTime}</div>
        </div>
        <div className='sum'>
          <div className='v mono'>100%</div>
          <div className='k'>{c.summaryTimecode}</div>
        </div>
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className='pvm'>
          <div className='pvm-h'>{c.previewTitle}</div>
          {rows.map((orig, i) => (
            <div className='pvm-row' key={i}>
              <div className='o'>{orig}</div>
              <div className='t'>{translations[i]}</div>
            </div>
          ))}
        </div>
      )}

      <button type='button' className='btn btn-ghost btn-block' onClick={onStartOver}>
        {c.startOver}
      </button>
    </div>
  );
}
