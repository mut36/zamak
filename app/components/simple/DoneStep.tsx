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
  // Preview and counts read the canonical SRT whatever the download format is.
  const originals = previewBodies(originalContent, 3);
  const translations = previewBodies(result.content, 3);
  const rows = originals.slice(0, translations.length);
  const [primary, ...alternates] = result.downloads;

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

      {/* Partial-failure notice — lines that were still original after the
          recovery sweep retried them, or a fatal error (quota/auth) that
          stopped the job early. failedChunks is deliberately not a trigger:
          a chunk the main pass lost is usually recovered block by block, so
          it says nothing about the file being downloaded. */}
      {result.stopReason || result.fallbackBlocks ? (
        <div
          className='card p-4 mt-6 text-[13px] leading-relaxed'
          style={{
            color: 'oklch(0.5 0.13 75)',
            background: 'oklch(0.97 0.03 85)',
          }}
        >
          {result.stopReason
            ? c.stopReason[result.stopReason]
            : c.partialWarning(result.fallbackBlocks ?? 0)}
        </div>
      ) : null}

      {/* Download card. A second button appears only when the uploaded format
          could be rebuilt — primary is that format, SRT is always the
          fallback, so there is never a state with no way to download. */}
      <div className='card dl-card mt-6'>
        <div className='dl-file'>
          <FileIcon />
          <span className='nm'>{primary.filename}</span>
        </div>
        <button
          type='button'
          className='btn btn-primary btn-block'
          onClick={() => downloadFile(primary.content, primary.filename, primary.mime)}
        >
          <DownloadIcon />
          {alternates.length > 0 ? c.downloadAs(primary.extension) : c.download}
        </button>
        {alternates.length > 0 && (
          <>
            <p className='mt-2 text-[12px] text-ink-3'>
              {c.downloadAsHint(primary.extension)}
            </p>
            {alternates.map((option) => (
              <button
                key={option.extension}
                type='button'
                className='btn btn-ghost btn-block mt-1'
                onClick={() =>
                  downloadFile(option.content, option.filename, option.mime)
                }
              >
                {c.downloadAs(option.extension)}
              </button>
            ))}
          </>
        )}
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
          <div className='v mono'>{c.summaryTimecodeValue}</div>
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
