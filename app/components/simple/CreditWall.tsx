'use client';

import { COPY } from '../../i18n/simpleCopy';

const c = COPY.credits;

interface CreditWallProps {
  /** 'insufficient_credits' | 'file_too_large' | anything else. */
  code: string;
  maxBlocks?: number;
  totalBlocks: number;
  onStartOver: () => void;
}

/**
 * Shown when the server declined to open a job. Nothing was spent and nothing
 * ran, so this explains rather than apologises.
 */
export function CreditWall({
  code,
  maxBlocks,
  totalBlocks,
  onStartOver,
}: CreditWallProps) {
  const tooLarge = code === 'file_too_large';

  return (
    <div className='animate-fade-slide-up'>
      <div className='head text-center mb-7'>
        <h1>{tooLarge ? c.tooLargeTitle : c.emptyTitle}</h1>
        <p>
          {tooLarge
            ? c.tooLargeBody(maxBlocks ?? 0, totalBlocks)
            : c.emptyBody}
        </p>
      </div>

      <div className='card p-[22px] flex flex-col items-center gap-3'>
        {!tooLarge && (
          <button type='button' className='btn btn-primary btn-lg w-full' disabled>
            {c.emptyCta}
          </button>
        )}
        <button type='button' className='btn w-full' onClick={onStartOver}>
          {c.startOver}
        </button>
      </div>
    </div>
  );
}
