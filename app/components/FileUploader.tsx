import type { ChangeEvent, DragEvent, RefObject } from 'react';
import type { Translations } from '../i18n';

interface FileUploaderProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  illustration: string;
  isDragOver: boolean;
  error: string;
  text: Translations;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

export function FileUploader({
  fileInputRef,
  illustration,
  isDragOver,
  error,
  text,
  onFileChange,
  onDragOver,
  onDragLeave,
  onDrop,
}: FileUploaderProps) {
  return (
    <>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-16 px-8 cursor-default transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/30'
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={illustration}
          alt=''
          className='w-50 h-50 mb-6 brightness-120'
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <p className='text-lg font-medium text-gray-700 dark:text-gray-200 mb-2'>
          {text.dropHere}
        </p>
        <p className='text-sm text-gray-400 dark:text-gray-500 mb-4'>
          {text.or}
        </p>
        <button
          type='button'
          onClick={(event) => {
            event.stopPropagation();
            fileInputRef.current?.click();
          }}
          className='px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer'
        >
          {text.browse}
        </button>
        <p className='mt-4 text-xs text-gray-400 dark:text-gray-500'>
          {text.supportedFormat}
        </p>
        <input
          ref={fileInputRef}
          type='file'
          accept='.srt'
          onChange={onFileChange}
          className='hidden'
        />
      </div>

      {error && (
        <div className='mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg'>
          <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
        </div>
      )}
    </>
  );
}
