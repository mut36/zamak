'use client';

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { FileUploader } from './components/FileUploader';
import { SuccessModal } from './components/SuccessModal';
import { TranslationProgressPanel } from './components/TranslationProgressPanel';
import { useDarkMode } from './hooks/useDarkMode';
import { useProgressDisplay } from './hooks/useProgressDisplay';
import { useTranslation } from './hooks/useTranslation';
import { TEXT, type SiteLang } from './i18n';
import type { MovieInfo } from './types/translation';

const UPLOAD_ILLUSTRATION = '/loading-tedesco.gif';
const TRANSLATION_PRESETS = {
  advanced: { model: 'gemini-3.1-pro-preview' },
  fast: { model: 'gemini-3.5-flash' },
  gpt: { model: 'gpt-5.6-terra' },
  claude: { model: 'claude-haiku-4-5-20251001' },
} as const;

// 점검 종료 시 아래를 false로 변경하세요
const MAINTENANCE_MODE = false;

function getTimestamp(): number {
  return Date.now();
}

export default function Home() {
  const { isDark, toggleDark } = useDarkMode();
  // Movie info form
  const [movieInfo, setMovieInfo] = useState<MovieInfo>({
    title: '',
    genre: '',
    year: '',
    country: '',
    era: '',
    notes: '',
  });

  const [siteLang, setSiteLang] = useState<SiteLang>(() => {
    try {
      const saved = localStorage.getItem('siteLang');
      return saved === 'en' ? 'en' : 'ko';
    } catch {
      return 'ko';
    }
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    try {
      return localStorage.getItem('siteLang') === 'en' ? 'English' : 'ko';
    } catch {
      return 'ko';
    }
  });
  const t = TEXT[siteLang];

  const onMetaUpdate = useCallback(
    (meta: {
      title?: string;
      year?: string;
      inferredTitle?: string;
      inferredYear?: string;
      inferredGenre?: string;
      inferredCountry?: string;
      inferredEra?: string;
    }) => {
      if (meta.inferredTitle) {
        setMovieInfo((prev) => ({
          ...prev,
          title: meta.inferredTitle || prev.title,
          year: meta.inferredYear || prev.year,
        }));
      } else {
        setMovieInfo((prev) => ({
          ...prev,
          title: meta.title || '',
          year: meta.year || '',
        }));
      }
    },
    [],
  );

  const translationMessages = useMemo(
    () => ({
      serverError: t.errServerError,
      noResponse: t.errNoResponse,
      invalidFile: t.errInvalidFile,
      emptyFile: t.errEmptyFile,
      generalError: t.errGeneral,
    }),
    [t],
  );

  const {
    file,
    isTranslating,
    error,
    analysis,
    translationProgress,
    handleFileChange,
    handleFileDrop,
    translate,
    cancelTranslation,
    clearFile,
  } = useTranslation(onMetaUpdate, translationMessages, siteLang);

  type EnrichStep = 'searching' | 'confirmMovie' | 'notFound' | 'ready';
  const [enrichStep, setEnrichStep] = useState<EnrichStep | null>(null);
  const [enrichDirector, setEnrichDirector] = useState<string>('');

  const [isDragOver, setIsDragOver] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('');
  const translateStartRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const { liveRemainingMs, targetProgress, transitionDuration } =
    useProgressDisplay(translationProgress);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (siteLang === 'ko') {
      return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
    }
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const [activeModel, setActiveModel] = useState<string>('');

  const handleTranslate = (modelKey: 'fast' | 'gpt' | 'claude') => {
    const { model } = TRANSLATION_PRESETS[modelKey];
    setActiveModel(model);
    translateStartRef.current = getTimestamp();
    const onSuccess = () => {
      const elapsed = getTimestamp() - translateStartRef.current;
      const formatted = formatElapsed(elapsed);
      setElapsedTime(formatted);
      setShowSuccessToast(true);
    };
    translate(movieInfo, model, targetLang, 'meaning', onSuccess);
  };

  const handleEnrich = useCallback(async (title: string, year: string) => {
    setEnrichStep('searching');
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), year: year.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (data.isMovie && data.notes) {
        setEnrichDirector(data.director ?? '');
        setMovieInfo((prev) => ({
          ...prev,
          notes: data.notes,
          year: prev.year || data.year || '',
        }));
        setEnrichStep('confirmMovie');
      } else {
        setMovieInfo((prev) => ({ ...prev, notes: '' }));
        setEnrichStep('notFound');
      }
    } catch {
      setEnrichStep('notFound');
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setEnrichStep(null);
      setEnrichDirector('');
    } else if (analysis.completed && enrichStep === null) {
      handleEnrich(movieInfo.title, movieInfo.year);
    }
  // movieInfo.title/year intentionally excluded — only trigger on analysis completion
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, analysis.completed, enrichStep, handleEnrich]);

  const handleCancelTranslation = () => {
    const message =
      translationProgress.currentChunk > 0
        ? t.cancelConfirmPartial
        : t.cancelConfirm;
    if (confirm(message)) {
      cancelTranslation();
    }
  };

  const handleReplaceFile = () => {
    replaceFileInputRef.current?.click();
  };

  const onReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.toLowerCase().endsWith('.srt')) {
        setMovieInfo({
          title: '',
          genre: '',
          year: '',
          country: '',
          era: '',
          notes: '',
        });
        setEnrichStep(null);
        setEnrichDirector('');
        handleFileDrop(selectedFile);
      }
    }
    e.target.value = '';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileDrop(droppedFile);
    }
  };

  if (MAINTENANCE_MODE) {
    return (
      <div className='min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4 text-center px-6'>
          {/* Replace with your image: add a file to /public and update the src */}
          <Image
            src='/maintenance.jpeg'
            alt=''
            width={400}
            height={400}
            className='w-100 object-contain'
          />
          <h1 className='text-2xl font-bold text-gray-800 dark:text-white'>
            🚧 We&apos;ll be back soon! 🚧
          </h1>
          <p className='text-gray-500 dark:text-gray-400 max-w-xs'>
            Our topolino need a break. <br />
            Back shortly 🐭
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes fadeSlideDown {
          from {
            opacity: 0;
            transform: translateY(-1rem) translateX(-50%);
          }
          to {
            opacity: 1;
            transform: translateY(0) translateX(-50%);
          }
        }
        @keyframes indeterminate {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
        @keyframes mouseBounce {
          0%, 100% {
            left: 15%;
          }
          50% {
            left: 80%;
          }
        }
      `}</style>
      <div className='min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 relative cursor-default transition-colors duration-300'>
        {/* Top Right: Language Toggle + Dark Mode + Version */}
        <div className='absolute top-4 right-4 flex items-center gap-2'>
          <button
            type='button'
            onClick={() => {
              setSiteLang((prev) => {
                const next = prev === 'ko' ? 'en' : 'ko';
                if (next === 'ko') setTargetLang('ko');
                if (next === 'en') setTargetLang('English');
                try {
                  localStorage.setItem('siteLang', next);
                } catch {}
                return next;
              });
            }}
            className='px-2.5 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 border border-gray-300 dark:border-gray-600 transition-colors cursor-pointer'
            aria-label='Switch language'
          >
            {siteLang === 'ko' ? 'EN' : '한국어'}
          </button>

          <button
            type='button'
            onClick={toggleDark}
            className='p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer'
            aria-label={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? (
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
                />
              </svg>
            ) : (
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
                />
              </svg>
            )}
          </button>

          <span className='text-xs text-gray-400 dark:text-gray-500'>
            v0.16.0 &bull; Beta
          </span>
        </div>

        {/* Success Modal */}
        {showSuccessToast && (
          <SuccessModal
            elapsedTime={elapsedTime}
            text={t}
            onClose={() => setShowSuccessToast(false)}
          />
        )}

        <div className='container mx-auto px-4 py-16 cursor-default'>
          <div className='max-w-5xl mx-auto'>
            {/* Header */}
            <div className='text-center mb-12 cursor-default'>
              <h1 className='text-4xl font-bold text-gray-900 dark:text-white mb-4'>
                {t.title}
              </h1>
              <p className='text-lg text-gray-600 dark:text-gray-300'>
                {t.subtitle}
              </p>
            </div>

            {/* Main Card */}
            <div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8'>
              {!file ? (
                /* ===== Step 1: File Upload ===== */
                <FileUploader
                  fileInputRef={fileInputRef}
                  illustration={UPLOAD_ILLUSTRATION}
                  isDragOver={isDragOver}
                  error={error}
                  text={t}
                  onFileChange={handleFileChange}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              ) : (
                /* ===== Step 2: Confirmation Screen ===== */
                <>
                  {/* Selected File */}
                  <div className='flex items-center justify-between mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg'>
                    <p className='text-sm text-green-700 dark:text-green-400 truncate'>
                      {file.name}
                    </p>
                    <div className='flex items-center gap-2 ml-3 shrink-0'>
                      <button
                        type='button'
                        onClick={handleReplaceFile}
                        disabled={isTranslating}
                        className='px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-500 rounded hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer'
                      >
                        {t.changeFile}
                      </button>
                      <button
                        type='button'
                        onClick={clearFile}
                        disabled={isTranslating}
                        className='p-1.5 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-500 rounded hover:border-red-400 hover:text-red-500 dark:hover:border-red-400 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer'
                        aria-label={t.removeFile}
                      >
                        <svg
                          className='w-4 h-4'
                          fill='none'
                          stroke='currentColor'
                          viewBox='0 0 24 24'
                        >
                          <path
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            strokeWidth={2}
                            d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                          />
                        </svg>
                      </button>
                    </div>
                    <input
                      ref={replaceFileInputRef}
                      type='file'
                      accept='.srt'
                      onChange={onReplaceFileChange}
                      className='hidden'
                    />
                  </div>

                  {/* Step: Extracting */}
                  {analysis.isAnalyzing && (
                    <div className='mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3'>
                      <svg className='animate-spin h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' />
                      </svg>
                      <p className='text-sm text-amber-700 dark:text-amber-400'>{t.analyzing}</p>
                    </div>
                  )}

                  {/* Step: Searching */}
                  {enrichStep === 'searching' && (
                    <div className='mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3'>
                      <svg className='animate-spin h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                        <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4' />
                        <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' />
                      </svg>
                      <p className='text-sm text-blue-700 dark:text-blue-400'>{t.enriching}</p>
                    </div>
                  )}

                  {/* Step: Confirm movie identity */}
                  {enrichStep === 'confirmMovie' && (
                    <div className='mb-6'>
                      <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4'>{t.confirmTitle}</h2>
                      <div className='mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm items-baseline'>
                        <span className='text-gray-500 dark:text-gray-400 whitespace-nowrap'>{t.labelTitle}</span>
                        <span className='font-semibold text-gray-900 dark:text-white'>{movieInfo.title}</span>
                        <span className='text-gray-500 dark:text-gray-400 whitespace-nowrap'>{t.labelYear}</span>
                        <span className='font-semibold text-gray-900 dark:text-white'>{movieInfo.year || '—'}</span>
                        <span className='text-gray-500 dark:text-gray-400 whitespace-nowrap'>{t.labelDirector}</span>
                        <span className='font-semibold text-gray-900 dark:text-white'>{enrichDirector || '—'}</span>
                      </div>
                      <div className='grid grid-cols-2 gap-3'>
                        <button
                          type='button'
                          onClick={() => setEnrichStep('ready')}
                          className='py-3 rounded-xl border-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-sm font-semibold text-blue-700 dark:text-blue-300 transition-all cursor-pointer'
                        >
                          {t.confirmYes}
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setMovieInfo((p) => ({ ...p, notes: '' }));
                            setEnrichStep('notFound');
                          }}
                          className='py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-400 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-all cursor-pointer'
                        >
                          {t.confirmNo}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step: Not found / manual — show translation UI */}
                  {enrichStep === 'notFound' && (
                    <>
                      {/* Notice + re-search */}
                      <div className='mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between gap-3'>
                        <p className='text-sm text-amber-700 dark:text-amber-400'>{t.enrichmentFailed}</p>
                        <button
                          type='button'
                          onClick={() => handleEnrich(movieInfo.title, movieInfo.year)}
                          className='shrink-0 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-400 dark:border-amber-600 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer'
                        >
                          {t.searchAgain}
                        </button>
                      </div>

                      {/* Editable title + year for re-search */}
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
                        <div>
                          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>{t.labelTitle}</label>
                          <input
                            type='text'
                            value={movieInfo.title}
                            onChange={(e) => setMovieInfo((p) => ({ ...p, title: e.target.value }))}
                            disabled={isTranslating}
                            className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                          />
                        </div>
                        <div>
                          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>{t.labelYear}</label>
                          <input
                            type='text'
                            value={movieInfo.year}
                            onChange={(e) => setMovieInfo((p) => ({ ...p, year: e.target.value }))}
                            disabled={isTranslating}
                            className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                          />
                        </div>
                      </div>

                      {/* Manual notes */}
                      <div className='mb-6'>
                        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>{t.labelNotes}</label>
                        <p className='mb-2 text-xs text-gray-400 dark:text-gray-500'>{t.notesTip}</p>
                        <textarea
                          value={movieInfo.notes}
                          onChange={(e) => setMovieInfo((p) => ({ ...p, notes: e.target.value }))}
                          disabled={isTranslating}
                          rows={4}
                          className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all resize-none'
                        />
                      </div>
                    </>
                  )}

                  {/* Step: Ready — confirmed movie, show enriched notes + translation UI */}
                  {enrichStep === 'ready' && (
                    <>
                      {/* Compact title + year */}
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
                        <div>
                          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>{t.labelTitle}</label>
                          <input
                            type='text'
                            value={movieInfo.title}
                            onChange={(e) => setMovieInfo((p) => ({ ...p, title: e.target.value }))}
                            disabled={isTranslating}
                            className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                          />
                        </div>
                        <div>
                          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>{t.labelYear}</label>
                          <input
                            type='text'
                            value={movieInfo.year}
                            onChange={(e) => setMovieInfo((p) => ({ ...p, year: e.target.value }))}
                            disabled={isTranslating}
                            className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                          />
                        </div>
                      </div>

                      {/* Enriched notes */}
                      <div className='mb-6'>
                        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>{t.enrichedInfoTitle}</label>
                        <p className='mb-2 text-xs text-gray-400 dark:text-gray-500'>{t.enrichedInfoDesc}</p>
                        <textarea
                          value={movieInfo.notes}
                          onChange={(e) => setMovieInfo((p) => ({ ...p, notes: e.target.value }))}
                          disabled={isTranslating}
                          rows={10}
                          className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all resize-none'
                        />
                      </div>
                    </>
                  )}

                  {/* Translation controls — shown in both notFound and ready */}
                  {(enrichStep === 'ready' || enrichStep === 'notFound') && (
                    <>
                      {/* Target Language Input (English UI only) */}
                      {siteLang === 'en' && (
                        <div className='mb-6 cursor-default'>
                          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>{t.targetLangLabel}</label>
                          <input
                            type='text'
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            disabled={isTranslating}
                            placeholder={t.targetLangPlaceholder}
                            className='w-full px-4 py-3 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all'
                          />
                        </div>
                      )}

                      {/* Error Message */}
                      {error && (
                        <div className='mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg'>
                          <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
                        </div>
                      )}

                      {/* Progress Bar */}
                      {isTranslating && (
                        <TranslationProgressPanel
                          progress={translationProgress}
                          targetProgress={targetProgress}
                          transitionDuration={transitionDuration}
                          liveRemainingMs={liveRemainingMs}
                          text={t}
                          onCancel={handleCancelTranslation}
                        />
                      )}

                      {/* Translate Buttons */}
                      <div className='grid grid-cols-3 gap-3'>
                        <button
                          type='button'
                          onClick={() => handleTranslate('fast')}
                          disabled={!file || isTranslating}
                          className='py-4 rounded-xl bg-linear-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white text-sm font-semibold text-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]'
                        >
                          {isTranslating && activeModel === TRANSLATION_PRESETS.fast.model ? t.translating : t.translateBtn}
                        </button>
                        <button
                          type='button'
                          onClick={() => handleTranslate('gpt')}
                          disabled={!file || isTranslating}
                          className='py-4 rounded-xl bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold text-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]'
                        >
                          {isTranslating && activeModel === TRANSLATION_PRESETS.gpt.model ? t.translating : t.translateBtnGpt}
                        </button>
                        <button
                          type='button'
                          onClick={() => handleTranslate('claude')}
                          disabled={!file || isTranslating}
                          className='py-4 rounded-xl bg-linear-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-semibold text-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]'
                        >
                          {isTranslating && activeModel === TRANSLATION_PRESETS.claude.model ? t.translating : t.translateBtnClaude}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Info Section */}
              <div className='mt-8 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-default'>
                <div className='space-y-5'>
                  <section>
                    <h3 className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      {t.howToUse}
                    </h3>
                    <ol className='text-sm text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside'>
                      <li>{t.step1.replace(/^1\.\s*/, '')}</li>
                      <li>{t.step2.replace(/^2\.\s*/, '')}</li>
                      <li>{t.step3.replace(/^3\.\s*/, '')}</li>
                      <li>{t.step4.replace(/^4\.\s*/, '')}</li>
                      <li>{t.step5.replace(/^5\.\s*/, '')}</li>
                    </ol>
                  </section>

                  <section>
                    <h3 className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      {t.tipsTitle}
                    </h3>
                    <ul className='text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside'>
                      <li>{t.tipNonMovie}</li>
                      <li>{t.tipExample}</li>
                      <li>{t.tipSrtOnly}</li>
                      <li>{t.tipStandard}</li>
                    </ul>
                  </section>

                  <section>
                    <h3 className='text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      {t.disclaimerTitle}
                    </h3>
                    <ul className='text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside'>
                      <li>{t.disclaimer1}</li>
                      <li>{t.disclaimer2}</li>
                    </ul>
                  </section>
                </div>
                <p className='text-xs text-gray-400 dark:text-gray-400 mt-2 text-center'>
                  &copy; 2026 romag. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
