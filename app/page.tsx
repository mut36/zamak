'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { StepTracker } from './components/simple/StepTracker';
import { UploadStep } from './components/simple/UploadStep';
import { InfoStep } from './components/simple/InfoStep';
import { ProgressStep } from './components/simple/ProgressStep';
import { DoneStep } from './components/simple/DoneStep';
import { LandingPage } from './components/simple/LandingPage';
import { CreditWall } from './components/simple/CreditWall';
import { PurchaseStep } from './components/simple/PurchaseStep';
import { useTranslation } from './hooks/useTranslation';
import { useEnrich } from './hooks/useEnrich';
import { useAuth } from './hooks/useAuth';
import { fetchMoviePoster } from './lib/client/tmdb';
import { parseSrtBlocks } from './lib/srt';
import { isSupabaseConfigured } from './lib/supabase/env';
import { DEFAULT_TARGET_LANG } from './config/languages';
import { TRANSLATION_MODEL } from './config/constants';
import type { ContentType, MovieInfo } from './types/translation';
import { COPY } from './i18n/simpleCopy';

const EMPTY_MOVIE_INFO: MovieInfo = { title: '', year: '', notes: '' };
// Keep in sync with package.json version.
const APP_VERSION = '0.3.0';

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
  const [authError, setAuthError] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState('');

  const {
    user,
    balance,
    loading: authLoading,
    signIn,
    signOut,
    refreshBalance,
  } = useAuth();

  // Both round-trips that leave the app — OAuth and the Toss payment window —
  // report back through query params. Read them once, then clean the URL so a
  // refresh does not re-show a stale banner (or re-count a purchase).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get('purchase');
    let handled = false;

    if (params.get('auth_error')) {
      setAuthError(COPY.auth.failed);
      handled = true;
    }

    if (purchase === 'done') {
      const credits = Number(params.get('credits'));
      setPurchaseNotice(
        COPY.purchase.done(Number.isFinite(credits) ? credits : 0),
      );
      // The grant already happened server-side; this only catches the header up.
      refreshBalance();
      handled = true;
    } else if (purchase === 'failed') {
      const code = params.get('code') || '';
      setPurchaseNotice(
        code === 'PAY_PROCESS_CANCELED'
          ? COPY.purchase.canceled
          : `${COPY.purchase.failed} ${code ? COPY.purchase.failedCode(code) : ''}`.trim(),
      );
      handled = true;
    }

    if (handled) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshBalance]);

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
    refusal,
    handleFileDrop,
    translate,
    cancelTranslation,
    clearFile,
  } = useTranslation(onMetaUpdate);

  const {
    status: enrichStatus,
    director,
    error: enrichError,
    enrich,
    reset: resetEnrich,
  } = useEnrich();

  const totalLines = useMemo(
    () => (fileContent ? parseSrtBlocks(fileContent).length : 0),
    [fileContent],
  );

  // Latest values for async callbacks, so the enrich/summarize lifecycle can
  // live in the orchestrator (surviving step changes) without stale closures.
  const movieInfoRef = useRef(movieInfo);
  const fileContentRef = useRef(fileContent);
  useEffect(() => {
    movieInfoRef.current = movieInfo;
    fileContentRef.current = fileContent;
  }, [movieInfo, fileContent]);

  const enrichStartedRef = useRef(false);
  const summarizeStartedRef = useRef(false);

  // Movie branch: AI enrich (director + tone/character notes) and the TMDB
  // poster fetch run in parallel, then land in a single state update. Metadata
  // comes from the AI; TMDB contributes the poster image only.
  const runEnrich = useCallback(async () => {
    const { title, year } = movieInfoRef.current;
    const [data, posterUrl] = await Promise.all([
      enrich(title, year),
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
            headers: { 'Content-Type': 'application/json' },
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
    setUploadError('');
    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Step 1 goes up immediately so the "분석 중" spinner covers the wait.
    handleFileDrop(selected);
    setStep(1);
  };

  const handleTranslate = async () => {
    setStep(2);
    // translate() resolves true on success, false on error/abort/refusal.
    const ok = await translate(
      movieInfo,
      TRANSLATION_MODEL,
      targetLang,
      'meaning',
    );
    // The balance moved either way: a success spent the credit, and a refusal
    // means our cached number was stale.
    refreshBalance();
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
    setPurchasing(false);
    setPurchaseNotice('');
    setStep(0);
  };

  const header = (
    <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
      <BrandMark onClick={resetAll} />
      <div className='flex items-center gap-2.5'>
        {user && balance !== null && (
          // The balance doubles as the way in to topping it up — there is no
          // other entry point except running out mid-flow.
          <button
            type='button'
            className='lang-pill'
            onClick={() => setPurchasing(true)}
          >
            {COPY.auth.creditsLeft(balance)}
          </button>
        )}
        {user ? (
          <button
            type='button'
            className='text-[12px] text-ink-3 underline'
            onClick={signOut}
          >
            {COPY.auth.signOut}
          </button>
        ) : (
          <span className='lang-pill'>{COPY.langPill}</span>
        )}
      </div>
    </header>
  );

  // Auth is the outermost gate: every route that spends the server key is
  // closed to anonymous callers, so there is nothing to show behind it.
  if (authLoading) {
    return (
      <div className='min-h-screen'>
        {header}
        <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
          <p className='text-center text-sm text-ink-3 py-16'>
            {COPY.auth.loading}
          </p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='min-h-screen'>
        {header}
        <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
          <LandingPage
            onSignIn={signIn}
            error={authError}
            configured={isSupabaseConfigured}
          />
        </main>
      </div>
    );
  }

  return (
    <div className='min-h-screen'>
      {header}

      <main className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pt-4 pb-14'>
        {purchaseNotice && (
          <div className='card p-4 mb-[14px] text-sm'>{purchaseNotice}</div>
        )}

        {/* Buying credits suspends the wizard rather than replacing it: the
            file and its analysis survive, so a top-up mid-flow returns to the
            same step. */}
        {purchasing ? (
          <PurchaseStep balance={balance} onClose={() => setPurchasing(false)} />
        ) : (
        <>
        {!refusal && <StepTracker current={step} />}

        {refusal && (
          <CreditWall
            code={refusal.code}
            maxBlocks={refusal.maxBlocks}
            totalBlocks={totalLines}
            onStartOver={resetAll}
            onPurchase={() => setPurchasing(true)}
          />
        )}

        {!refusal && step === 0 && (
          <UploadStep
            targetLang={targetLang}
            onTargetLang={setTargetLang}
            contentType={contentType}
            onContentType={setContentType}
            error={uploadError}
            onFile={handleFile}
          />
        )}

        {!refusal && step === 1 && (
          <>
            {error && (
              <div
                className='card p-4 mb-4 text-sm'
                style={{ color: 'oklch(0.55 0.2 25)' }}
              >
                {error}
              </div>
            )}
            <InfoStep
              contentType={contentType}
              movieInfo={movieInfo}
              setMovieInfo={setMovieInfo}
              enrichStatus={enrichStatus}
              enrichError={enrichError}
              director={director}
              analysisAnalyzing={analysis.isAnalyzing}
              onReEnrich={runEnrich}
              summarizing={summarizing}
              onBack={resetAll}
              onTranslate={handleTranslate}
            />
          </>
        )}

        {!refusal && step === 2 && (
          <ProgressStep
            progress={translationProgress}
            totalLines={totalLines}
            onCancel={handleCancel}
          />
        )}

        {!refusal && step === 3 && result && (
          <DoneStep
            result={result}
            originalContent={fileContent}
            onStartOver={resetAll}
          />
        )}
        </>
        )}
      </main>

      <footer className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pb-10 text-center text-ink-3'>
        <p className='mono text-[12px]'>v{APP_VERSION} · Beta</p>
        <p className='text-[12px] mt-1'>© 2026 ZAMAK. All rights reserved.</p>
        <a
          href={`mailto:${COPY.footer.feedbackEmail}`}
          className='text-[12px] mt-1 inline-block underline'
        >
          {COPY.footer.feedback}
        </a>
      </footer>
    </div>
  );
}
