'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { StepTracker } from './components/simple/StepTracker';
import { UploadStep } from './components/simple/UploadStep';
import { InfoStep } from './components/simple/InfoStep';
import { ProgressStep } from './components/simple/ProgressStep';
import { DoneStep } from './components/simple/DoneStep';
import { useTranslation } from './hooks/useTranslation';
import { useEnrich } from './hooks/useEnrich';
import { fetchMoviePoster } from './lib/client/tmdb';
import { parseSrtBlocks } from './lib/srt';
import { isInvalidKeyError } from './utils/apiKeyError';
import { DEFAULT_TARGET_LANG } from './config/languages';
import { TRANSLATION_MODEL } from './config/constants';
import type { ContentType, MovieInfo } from './types/translation';
import { COPY } from './i18n/simpleCopy';

const EMPTY_MOVIE_INFO: MovieInfo = { title: '', year: '', notes: '' };
// Keep in sync with package.json version.
const APP_VERSION = '0.2.0';

function isSrt(file: File): boolean {
  return file.name.toLowerCase().endsWith('.srt');
}

export default function Home() {
  const [step, setStep] = useState(0);
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [targetLang, setTargetLang] = useState<string>(DEFAULT_TARGET_LANG);
  const [movieInfo, setMovieInfo] = useState<MovieInfo>(EMPTY_MOVIE_INFO);
  const [uploadError, setUploadError] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  // Optional BYOK Gemini key for translation; held in sessionStorage only.
  const [geminiKey, setGeminiKey] = useState('');

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('geminiKey');
      if (saved) setGeminiKey(saved);
    } catch {}
  }, []);

  const updateGeminiKey = useCallback((value: string) => {
    setGeminiKey(value);
    try {
      if (value) sessionStorage.setItem('geminiKey', value);
      else sessionStorage.removeItem('geminiKey');
    } catch {}
  }, []);

  const onMetaUpdate = useCallback(
    (meta: { inferredTitle?: string; inferredYear?: string }) => {
      setMovieInfo((prev) => ({
        ...prev,
        title: meta.inferredTitle || prev.title,
        year: meta.inferredYear || prev.year,
      }));
    },
    [],
  );

  const {
    fileContent,
    error,
    analysis,
    translationProgress,
    result,
    handleFileDrop,
    translate,
    cancelTranslation,
    clearFile,
  } = useTranslation(onMetaUpdate);

  const { status: enrichStatus, director, enrich, reset: resetEnrich } =
    useEnrich();

  const totalLines = useMemo(
    () => (fileContent ? parseSrtBlocks(fileContent).length : 0),
    [fileContent],
  );

  // Latest values for async callbacks, so the enrich/summarize lifecycle can
  // live in the orchestrator (surviving step changes) without stale closures.
  const movieInfoRef = useRef(movieInfo);
  const fileContentRef = useRef(fileContent);
  const geminiKeyRef = useRef(geminiKey);
  useEffect(() => {
    movieInfoRef.current = movieInfo;
    fileContentRef.current = fileContent;
    geminiKeyRef.current = geminiKey;
  }, [movieInfo, fileContent, geminiKey]);

  const enrichStartedRef = useRef(false);
  const summarizeStartedRef = useRef(false);

  // Movie branch: AI enrich (director + tone/character notes) and the TMDB
  // poster fetch run in parallel, then land in a single state update. Metadata
  // comes from the AI; TMDB contributes the poster image only.
  const runEnrich = useCallback(async () => {
    const { title, year } = movieInfoRef.current;
    const [data, posterUrl] = await Promise.all([
      enrich(title, year, geminiKeyRef.current),
      fetchMoviePoster(title, year),
    ]);
    setMovieInfo((prev) => ({
      ...prev,
      posterUrl: posterUrl ?? undefined,
      ...(data?.isMovie && data.notes
        ? { notes: data.notes, year: prev.year || data.year || '' }
        : { notes: '' }),
    }));
  }, [enrich]);

  // Auto-analyze once per file: movie → web-search enrich + TMDB poster,
  // other → summarize. Guarded by refs so returning never re-triggers.
  useEffect(() => {
    if (step !== 1) return;
    if (contentType === 'movie') {
      if (analysis.completed && !enrichStartedRef.current) {
        enrichStartedRef.current = true;
        runEnrich();
      }
    } else if (fileContent && !summarizeStartedRef.current) {
      summarizeStartedRef.current = true;
      (async () => {
        setSummarizing(true);
        try {
          const res = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(geminiKeyRef.current
                ? { 'x-gemini-key': geminiKeyRef.current }
                : {}),
            },
            body: JSON.stringify({ content: fileContentRef.current }),
          });
          const data = res.ok ? await res.json() : { summary: '' };
          if (data.summary) {
            setMovieInfo((prev) => ({ ...prev, notes: prev.notes || data.summary }));
          }
        } catch {
          /* leave notes empty on failure */
        } finally {
          setSummarizing(false);
        }
      })();
    }
  }, [step, contentType, analysis.completed, fileContent, runEnrich]);

  const resetAnalysis = () => {
    enrichStartedRef.current = false;
    summarizeStartedRef.current = false;
    resetEnrich();
    setSummarizing(false);
  };

  const handleFile = async (selected: File) => {
    if (!isSrt(selected)) {
      setUploadError(COPY.upload.invalidFile);
      return;
    }
    // Free tier is BYOK-only: refuse to start without the user's key.
    const key = geminiKey.trim();
    if (!key) {
      setUploadError(COPY.upload.keyNeededError);
      return;
    }
    setUploadError('');
    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Step 1 goes up immediately so the "분석 중" spinner covers the wait.
    const analyzing = handleFileDrop(selected, key);
    setStep(1);
    const analyzed = await analyzing;

    // Analysis is the first call the key ever makes, so a bad key surfaces
    // here. Send the user back to the field that can fix it and drop the key
    // — the input is a password field, so leaving it in place would just show
    // dots that look correct.
    if (analyzed?.error && isInvalidKeyError(analyzed.error)) {
      updateGeminiKey('');
      clearFile();
      resetAnalysis();
      setMovieInfo(EMPTY_MOVIE_INFO);
      setUploadError(COPY.upload.keyInvalidError);
      setStep(0);
    }
  };

  const handleTranslate = async () => {
    setStep(2);
    // translate() resolves true on success, false on error/abort.
    // Pass the BYOK key only when set; otherwise the server key is used.
    const ok = await translate(
      movieInfo,
      TRANSLATION_MODEL,
      targetLang,
      'meaning',
      undefined,
      geminiKey ? { gemini: geminiKey } : undefined,
    );
    setStep(ok ? 3 : 1);
  };

  const handleCancel = () => {
    if (confirm(COPY.progress.cancelConfirm)) {
      cancelTranslation();
      setStep(1);
    }
  };

  const resetAll = () => {
    cancelTranslation();
    clearFile();
    resetAnalysis();
    setMovieInfo(EMPTY_MOVIE_INFO);
    setUploadError('');
    setContentType('movie');
    setStep(0);
  };

  return (
    <div className='min-h-screen'>
      <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
        <BrandMark onClick={resetAll} />
        <span className='lang-pill'>{COPY.langPill}</span>
      </header>

      <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
        <StepTracker current={step} />

        {step === 0 && (
          <UploadStep
            targetLang={targetLang}
            onTargetLang={setTargetLang}
            contentType={contentType}
            onContentType={setContentType}
            apiKey={geminiKey}
            onApiKey={updateGeminiKey}
            error={uploadError}
            onFile={handleFile}
          />
        )}

        {step === 1 && (
          <>
            {error && (
              <div
                className='card p-4 mb-4 text-sm'
                style={{ color: 'oklch(0.55 0.2 25)' }}
              >
                {isInvalidKeyError(error)
                  ? COPY.apiKey.invalid
                  : error}
              </div>
            )}
            <InfoStep
              contentType={contentType}
              movieInfo={movieInfo}
              setMovieInfo={setMovieInfo}
              enrichStatus={enrichStatus}
              director={director}
              analysisAnalyzing={analysis.isAnalyzing}
              onReEnrich={runEnrich}
              summarizing={summarizing}
              onBack={resetAll}
              onTranslate={handleTranslate}
            />
          </>
        )}

        {step === 2 && (
          <ProgressStep
            progress={translationProgress}
            totalLines={totalLines}
            onCancel={handleCancel}
          />
        )}

        {step === 3 && result && (
          <DoneStep
            result={result}
            originalContent={fileContent}
            onStartOver={resetAll}
          />
        )}
      </main>

      <footer className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pb-10 text-center text-ink-3'>
        <p className='mono text-[12px]'>v{APP_VERSION} · Beta</p>
        <p className='text-[12px] mt-1'>© 2026 ZAMAK. All rights reserved.</p>
      </footer>
    </div>
  );
}
