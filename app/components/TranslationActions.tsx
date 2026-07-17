import type { Translations } from '../i18n';

export type TranslationPreset = 'advanced' | 'fast' | 'gpt' | 'claude';

interface TranslationActionsProps {
  activePreset: TranslationPreset;
  disabled: boolean;
  isTranslating: boolean;
  text: Translations;
  onTranslate: (preset: TranslationPreset) => void;
}

export function TranslationActions({
  activePreset,
  disabled,
  isTranslating,
  text,
  onTranslate,
}: TranslationActionsProps) {
  const presets = [
    {
      value: 'advanced' as const,
      label: text.modelPrecise,
      description: text.modelPreciseDesc,
    },
    {
      value: 'fast' as const,
      label: text.modelFast,
      description: text.modelFastDesc,
    },
    {
      value: 'gpt' as const,
      label: text.modelGpt,
      description: text.modelGptDesc,
    },
    {
      value: 'claude' as const,
      label: text.modelClaude,
      description: text.modelClaudeDesc,
    },
  ];

  return (
    <div className='mb-4'>
      <p className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
        {text.qualityTitle}
      </p>
      <div className='grid grid-cols-1 sm:grid-cols-4 gap-2'>
        {presets.map((preset) => (
          <button
            key={preset.value}
            type='button'
            onClick={() => onTranslate(preset.value)}
            disabled={disabled}
            className={`px-4 py-4 text-sm text-white rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left transform hover:scale-[1.02] active:scale-[0.98] ${
              preset.value === 'advanced'
                ? 'bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                : preset.value === 'gpt'
                  ? 'bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                  : preset.value === 'claude'
                    ? 'bg-linear-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
                    : 'bg-linear-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700'
            }`}
          >
            <div className='font-semibold'>
              {isTranslating && activePreset === preset.value
                ? text.translating
                : preset.label}
            </div>
            <div className='text-xs mt-1 opacity-75'>
              {preset.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
