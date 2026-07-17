import type { Dispatch, SetStateAction } from 'react';
import type { Translations } from '../i18n';
import type { MovieInfo } from '../types/translation';

interface MovieInfoFormProps {
  movieInfo: MovieInfo;
  isAnalyzing: boolean;
  disabled: boolean;
  text: Translations;
  onChange: Dispatch<SetStateAction<MovieInfo>>;
}

type ShortField = Exclude<keyof MovieInfo, 'notes'>;

export function MovieInfoForm({
  movieInfo,
  isAnalyzing,
  disabled,
  text,
  onChange,
}: MovieInfoFormProps) {
  const fields: Array<{ key: ShortField; label: string }> = [
    { key: 'title', label: text.labelTitle },
    { key: 'year', label: text.labelYear },
    { key: 'genre', label: text.labelGenre },
    { key: 'country', label: text.labelCountry },
    { key: 'era', label: text.labelEra },
  ];

  return (
    <div className='mb-6 cursor-default'>
      <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1'>
        {text.movieInfo}
      </h2>
      <p className='text-xs text-gray-500 dark:text-gray-400 mb-3'>
        {text.movieInfoDesc}
      </p>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              {label}
              {isAnalyzing && key !== 'year' && (
                <span className='ml-2 text-xs text-amber-500'>
                  {text.analyzingInline}
                </span>
              )}
            </label>
            <input
              type='text'
              value={movieInfo[key]}
              onChange={(event) =>
                onChange((previous) => ({
                  ...previous,
                  [key]: event.target.value,
                }))
              }
              disabled={disabled}
              className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
            />
          </div>
        ))}
      </div>
      <div className='mt-4'>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
          {text.labelNotes}
        </label>
        <p className='mb-2 text-xs text-gray-400 dark:text-gray-500'>
          {text.notesTip}
        </p>
        <textarea
          value={movieInfo.notes}
          onChange={(event) =>
            onChange((previous) => ({
              ...previous,
              notes: event.target.value,
            }))
          }
          disabled={disabled}
          rows={3}
          className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all resize-none'
        />
      </div>
    </div>
  );
}
