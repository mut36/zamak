import type { Translations } from '../i18n';
import type { TranslationProgress } from '../types/translation';

interface TranslationProgressPanelProps {
  progress: TranslationProgress;
  targetProgress: number;
  transitionDuration: number;
  liveRemainingMs: number;
  text: Translations;
  onCancel: () => void;
}

function formatRemaining(ms: number, text: Translations): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${text.timeAbout} ${minutes}${text.timeMin}${seconds}${text.timeSec}`;
  }
  return `${text.timeAbout} ${seconds}${text.timeSec}`;
}

export function TranslationProgressPanel({
  progress,
  targetProgress,
  transitionDuration,
  liveRemainingMs,
  text,
  onCancel,
}: TranslationProgressPanelProps) {
  const statusText =
    progress.stage === 'finalizing'
      ? text.stageFinalizing
      : `${progress.currentChunk} / ${progress.totalChunks}`;

  return (
    <div className='mb-6 p-5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg'>
      <h3 className='text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3'>
        {text.progressTitle}
      </h3>

      <div className='relative mb-3'>
        <div
          className='h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden'
          role='progressbar'
          aria-valuenow={Math.round(targetProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className='h-full bg-linear-to-r from-blue-500 to-indigo-600 rounded-full relative overflow-hidden'
            style={{
              width: `${targetProgress}%`,
              transition: `width ${transitionDuration}s linear`,
            }}
          >
            {progress.stage === 'translating' && (
              <div className='absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]' />
            )}
          </div>
        </div>

        <div
          className='absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-2xl leading-none select-none pointer-events-none'
          style={{
            left: `${targetProgress}%`,
            transition: `left ${transitionDuration}s linear`,
          }}
        >
          🐭
        </div>
        <div className='absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 text-lg leading-none select-none pointer-events-none'>
          🧀
        </div>
      </div>

      <div className='flex items-center justify-between'>
        <span className='text-xs text-blue-600 dark:text-blue-400 font-medium'>
          {statusText}
        </span>
        {liveRemainingMs > 0 && (
          <span className='text-xs text-blue-600 dark:text-blue-400'>
            {text.estimatedTime}: {formatRemaining(liveRemainingMs, text)}
          </span>
        )}
      </div>

      <div className='flex justify-center mt-4'>
        <button
          type='button'
          onClick={onCancel}
          className='px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer'
        >
          {text.cancelTranslation}
        </button>
      </div>
    </div>
  );
}
