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

/**
 * 무슨 일이 일어났는지 사람 말로 적는다.
 *
 * 자막 단위로 셀 수 있는 둘(나눔·합침)만 숫자를 달고, 나머지 손질(마침표·
 * 말줄임표·3줄 접기)은 한 줄로 뭉친다. `enforceTextRules`의 report는 항목마다
 * 단위가 달라서(`linesMerged`는 줄, `linesJoined`는 자막) 그대로 나열하면
 * 읽는 사람이 같은 걸 센다고 오해한다.
 */
function changeLines(summary: PolishSummary): string[] {
  const c = COPY.polish;
  const lines: string[] = [];

  if (summary.blocksMerged > 0) lines.push(c.mergeLine(summary.blocksMerged));
  if (summary.linesSplit > 0) lines.push(c.splitLine(summary.linesSplit));
  if (summary.linesJoined > 0) lines.push(c.joinedLine(summary.linesJoined));
  // 노출 시간은 사용자가 켰을 때만 0이 아니다(`applySubtitleRules`의 timing).
  if (summary.timingAdjusted > 0)
    lines.push(c.timingLine(summary.timingAdjusted));

  const tidied =
    summary.trailingPunctuationStripped +
    summary.ellipsisNormalized +
    summary.linesMerged +
    summary.midLinePeriodsToCommas +
    summary.speakerLinesSplit +
    summary.speakerDashesNormalized;
  if (tidied > 0) lines.push(c.tidiedLine);

  return lines;
}

export function PolishDoneStep({
  summary,
  downloads,
  onStartOver,
}: PolishDoneStepProps) {
  const lines = changeLines(summary);
  const [primary, ...alternates] = downloads;

  return (
    <div className='animate-zslide'>
      <div className='head text-center mb-7'>
        <h1>{COPY.polish.doneTitle}</h1>
      </div>

      <div className='card p-[22px] mb-4'>
        {lines.length > 0 ? (
          <ul className='flex flex-col gap-2'>
            {lines.map((line) => (
              <li key={line} className='text-sm text-ink flex gap-2'>
                <span aria-hidden className='text-secondary'>
                  ·
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-secondary'>{COPY.polish.nothingToDo}</p>
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

        {summary.blocksMerged > 0 && (
          <p className='text-fineprint text-tertiary text-center'>
            {COPY.polish.mergeSrtOnly}
          </p>
        )}

        <button type='button' className='btn w-full' onClick={onStartOver}>
          {COPY.polish.startOver}
        </button>
      </div>
    </div>
  );
}
