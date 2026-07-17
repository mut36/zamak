import { Fragment } from 'react';
import { CheckIcon } from '../icons';
import { COPY } from '../../i18n/simpleCopy';

interface StepTrackerProps {
  /** 0 = file, 1 = info, 2 = translate, 3 = done. */
  current: number;
}

export function StepTracker({ current }: StepTrackerProps) {
  return (
    <div className='flex items-center justify-center mb-10'>
      {COPY.steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : '';
        return (
          <Fragment key={label}>
            {i > 0 && (
              <span
                className={`step-line${i <= current ? ' fill' : ''}`}
                aria-hidden
              />
            )}
            <div className={`step ${state}`}>
              <span className='dot'>
                {i < current ? <CheckIcon className='w-4 h-4' /> : i + 1}
              </span>
              <span className='lbl'>{label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
