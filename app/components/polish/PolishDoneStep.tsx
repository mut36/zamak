'use client';

import { COPY } from '../../i18n/simpleCopy';
import { downloadFile } from '../../utils/downloadFile';
import type { PolishSummary } from '../../hooks/usePolish';
import type { DownloadOption } from '../../types/translation';

interface PolishDoneStepProps {
  summary: PolishSummary;
  downloads: DownloadOption[];
  onStartOver: () => void;
}

/** 0인 항목은 문장에서 빠진다 — "0개 병합"은 정보가 아니라 소음이다. */
function summaryParts(summary: PolishSummary): string[] {
  const c = COPY.polish;
  const parts: string[] = [];
  if (summary.linesSplit > 0) parts.push(c.countSplit(summary.linesSplit));
  if (summary.trailingPunctuationStripped > 0)
    parts.push(c.countPunctuation(summary.trailingPunctuationStripped));
  if (summary.linesMerged > 0) parts.push(c.countMerged(summary.linesMerged));
  if (summary.ellipsisNormalized > 0)
    parts.push(c.countEllipsis(summary.ellipsisNormalized));
  if (summary.linesJoined > 0) parts.push(c.countJoined(summary.linesJoined));
  if (summary.speakerLinesSplit > 0)
    parts.push(c.countSpeaker(summary.speakerLinesSplit));
  return parts;
}

export function PolishDoneStep({
  summary,
  downloads,
  onStartOver,
}: PolishDoneStepProps) {
  const parts = summaryParts(summary);
  const [primary, ...alternates] = downloads;

  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{COPY.polish.doneTitle}</h1>
        <p>
          {parts.length > 0
            ? COPY.polish.summary(parts)
            : COPY.polish.nothingToDo}
        </p>
        {/* 나누지 못한 자막을 숨기지 않는다 — 결과를 그대로 쓸 사람에게
            "여기는 아직 길다"는 사실이 필요하다. */}
        {summary.unsplitLines > 0 && (
          <p className='text-fineprint text-secondary mt-2'>
            {COPY.polish.unsplit(summary.unsplitLines)}
          </p>
        )}
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {primary && (
          <button
            type='button'
            className='btn btn-primary w-full'
            onClick={() =>
              downloadFile(primary.content, primary.filename, primary.mime)
            }
          >
            {alternates.length > 0
              ? COPY.polish.downloadAs(primary.extension)
              : COPY.polish.download}
          </button>
        )}

        {alternates.map((option) => (
          <button
            key={option.extension}
            type='button'
            className='btn w-full'
            onClick={() =>
              downloadFile(option.content, option.filename, option.mime)
            }
          >
            {COPY.polish.downloadAs(option.extension)}
          </button>
        ))}

        <button type='button' className='btn w-full' onClick={onStartOver}>
          {COPY.polish.startOver}
        </button>
      </div>
    </div>
  );
}
