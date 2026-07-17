import type { Translations } from '../i18n';

interface SuccessModalProps {
  elapsedTime: string;
  text: Translations;
  onClose: () => void;
}

export function SuccessModal({
  elapsedTime,
  text,
  onClose,
}: SuccessModalProps) {
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
      <div className='bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center'>
        <div className='w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center'>
          <svg
            className='w-8 h-8 text-green-600 dark:text-green-400'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M5 13l4 4L19 7'
            />
          </svg>
        </div>
        <h2 className='text-xl font-bold text-gray-900 dark:text-white mb-2'>
          {text.toastTitle}
        </h2>
        <p className='text-sm text-gray-500 dark:text-gray-400 mb-1'>
          {text.toastDesc}
        </p>
        <p className='text-lg font-semibold text-green-600 dark:text-green-400 mb-6'>
          {text.successElapsed(elapsedTime)}
        </p>
        <button
          type='button'
          onClick={onClose}
          className='px-6 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors cursor-pointer'
        >
          {text.successClose}
        </button>
      </div>
    </div>
  );
}
