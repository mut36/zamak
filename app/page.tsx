'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandMark } from './components/BrandMark';
import { StepTracker } from './components/simple/StepTracker';
import { UploadStep } from './components/simple/UploadStep';
import { WorkPickStep } from './components/beta/WorkPickStep';
import { TranslateSettingsStep } from './components/beta/TranslateSettingsStep';
import { ProgressStep } from './components/simple/ProgressStep';
import { DoneStep } from './components/simple/DoneStep';
import { LandingPage } from './components/simple/LandingPage';
import { ExhaustedStep } from './components/beta/ExhaustedStep';
import { PurchaseStep } from './components/simple/PurchaseStep';
import { useWizard, type WizardScreen } from './hooks/useWizard';
import { useAuth } from './hooks/useAuth';
import { isSupabaseConfigured } from './lib/supabase/env';
import { APP_VERSION, estimateTranslationMs, GLOSSARY_WAIT_MS } from './config/constants';
import { COPY } from './i18n/simpleCopy';

// Maps the wizard's screen names to the numeric steps StepTracker renders.
// Keyed on WizardScreen (not string) so a typo or a new screen added later
// fails to typecheck instead of silently rendering step 0.
// 'exhausted' has no tracker position — the credit wall replaces the tracker
// entirely (see the `!refusal &&` guard below, which means `screen ===
// 'exhausted'` and `refusal` truthy are never both live at once) — its entry
// is a structurally-required placeholder that is never actually read.
const STEP_TRACKER_INDEX: Record<WizardScreen, number> = {
  upload: 0,
  workPick: 1,
  settings: 1,
  progress: 2,
  done: 3,
  exhausted: 0,
};

// Work identification (enrich for the movie branch, otherType/toneText for
// the "other" branch) is always resolved by the time handleTranslate can
// even be called — it only fires from the settings screen, which is reached
// through confirmWorkPick or the settings screen's own confirm banner, both
// of which settle movieInfo first. overallPercent's `enrichDone: false`
// branch exists for that function's own general behavior (its test suite
// covers it directly); it is not a state this wizard's wiring ever reaches,
// so ProgressStep always gets `true` here.
const ENRICH_ALWAYS_DONE = true;

export default function Home() {
  const [authError, setAuthError] = useState('');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState('');

  const router = useRouter();

  const {
    user,
    credits,
    email,
    loading: authLoading,
    signIn,
    signOut,
    refreshBalance,
  } = useAuth();

  const {
    screen,
    contentType,
    setContentType,
    targetLang,
    movieInfo,
    setMovieInfo,
    uploadError,
    uploading,
    uploadingFileName,
    handleFile,
    handleTranslate,
    handleCancel,
    resetAll: resetWizard,
    error,
    analysis,
    translationProgress,
    result,
    refusal,
    clearRefusal,
    jobId,
    totalLines,
    enrichStatus,
    enrichCandidates,
    castSheet,
    fileContentRef,
    movieInfoRef,
    selectedIndex,
    setSelectedIndex,
    otherType,
    setOtherType,
    toneText,
    setToneText,
    searchWork,
    confirmWorkPick,
    workConfirmed,
    autoMatched,
    confirmWork,
    goWorkPick,
    model,
    setModel,
  } = useWizard(
    {
      translate: COPY.translateErrors,
      upload: {
        bilingualSmi: COPY.upload.bilingualSmi,
        unreadableFile: COPY.upload.unreadableFile,
        invalidFile: COPY.upload.invalidFile,
      },
      cancelConfirm: COPY.progress.cancelConfirm,
    },
    refreshBalance,
  );

  // Settings screen's confirm banner vs. settled card — a single confident
  // TMDB match needs a yes/no before it's trusted, a manual pick or an
  // already-confirmed one doesn't.
  const needsConfirm = autoMatched && !workConfirmed;

  // ETA promise for the settings screen's bottom bar — reuses the same
  // per-model estimate the progress ring fills against (TRANSLATION_ESTIMATE_MS
  // via estimateTranslationMs), plus the cast-sheet grace period when that
  // toggle is on. No separate formula invented here.
  const etaSeconds = Math.round(
    (estimateTranslationMs(model) + (castSheet.enabled ? GLOSSARY_WAIT_MS : 0)) /
      1000,
  );

  // page.tsx owns purchasing/notice (payment UI chrome, not wizard state), so
  // "start over" clears both the wizard and this screen's own leftovers.
  const resetAll = () => {
    resetWizard();
    setPurchasing(false);
    setPurchaseNotice('');
  };

  // Both round-trips that leave the app — OAuth and the Toss payment window —
  // report back through query params. Read them once, then clean the URL so a
  // refresh does not re-show a stale banner (or re-count a purchase).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get('purchase');
    let handled = false;

    if (params.get('auth_error')) {
      // This effect only runs to sync a one-time redirect query param into
      // state on mount (an external system, per the rule's own carve-out) —
      // there is no render-time equivalent for "the URL said auth failed".
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const header = (
    <header className='flex items-center justify-between w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 h-16'>
      <BrandMark onClick={resetAll} />
      <div className='flex items-center gap-2.5'>
        {user && credits && (
          // The balance doubles as the way in to topping it up — there is no
          // other entry point except running out mid-flow.
          <button
            type='button'
            className='lang-pill'
            onClick={() => setPurchasing(true)}
          >
            {COPY.auth.creditsLeft(credits.lite)}
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
    // Landing is full-bleed minimal screen for private beta. No nav.
    return (
      <div className='min-h-screen'>
        <main className='w-full'>
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
          <PurchaseStep balance={credits?.lite ?? null} onClose={() => setPurchasing(false)} />
        ) : (
        <>
        {!refusal && <StepTracker current={STEP_TRACKER_INDEX[screen]} />}

        {refusal && refusal.code === 'insufficient_credits' && (
          <ExhaustedStep
            kind={refusal.kind ?? 'lite'}
            defaultEmail={email ?? ''}
            onGoHistory={() => router.push('/mypage')}
            onBack={clearRefusal}
          />
        )}

        {refusal && refusal.code === 'file_too_large' && (
          <div className='animate-fade-slide-up'>
            <div className='head text-center mb-7'>
              <h1>{COPY.credits.tooLargeTitle}</h1>
              <p>{COPY.credits.tooLargeBody(refusal.maxBlocks ?? 0, totalLines)}</p>
            </div>

            <div className='card p-[22px] flex flex-col items-center gap-3'>
              <button type='button' className='btn w-full' onClick={resetAll}>
                {COPY.credits.startOver}
              </button>
            </div>
          </div>
        )}

        {/* unauthorized / unknown: neither documented screen applies (not a
            credits or file-size problem), so this falls back to the app's
            generic error copy rather than misusing the file-too-large text. */}
        {refusal &&
          refusal.code !== 'insufficient_credits' &&
          refusal.code !== 'file_too_large' && (
            <div className='animate-fade-slide-up'>
              <div className='head text-center mb-7'>
                <h1>{COPY.error.title}</h1>
                <p>{COPY.error.body}</p>
              </div>

              <div className='card p-[22px] flex flex-col items-center gap-3'>
                <button type='button' className='btn w-full' onClick={resetAll}>
                  {COPY.error.retry}
                </button>
              </div>
            </div>
          )}

        {!refusal && screen === 'upload' && (
          <UploadStep
            contentType={contentType}
            onContentType={setContentType}
            uploading={uploading}
            uploadingFileName={uploadingFileName}
            error={uploadError}
            onFile={handleFile}
          />
        )}

        {!refusal && screen === 'workPick' && (
          <WorkPickStep
            contentType={contentType ?? 'movie'}
            fileName={uploadingFileName}
            candidates={enrichCandidates}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onSearch={searchWork}
            // Covers both the file-analysis phase and the TMDB search itself
            // (mirrors InfoStep's old `busy` computation) so the movie branch
            // never flashes an empty candidate list before either kicks in.
            searching={
              analysis.isAnalyzing ||
              enrichStatus === 'searching' ||
              enrichStatus === 'idle'
            }
            otherType={otherType}
            onOtherType={setOtherType}
            toneText={toneText}
            onToneText={setToneText}
            onConfirm={confirmWorkPick}
          />
        )}

        {!refusal && screen === 'settings' && (
          <>
            {error && (
              <div
                className='card p-4 mb-4 text-sm'
                style={{ color: 'oklch(0.55 0.2 25)' }}
              >
                {error}
              </div>
            )}
            <TranslateSettingsStep
              contentType={contentType ?? 'movie'}
              movieInfo={movieInfo}
              onMovieInfo={(patch) =>
                setMovieInfo((prev) => ({ ...prev, ...patch }))
              }
              needsConfirm={needsConfirm}
              onConfirmWork={confirmWork}
              onChangeWork={goWorkPick}
              model={model}
              onModel={setModel}
              credits={credits}
              targetLang={targetLang}
              castSheetEnabled={castSheet.enabled}
              onCastSheetToggle={castSheet.setEnabled}
              castSheetStatus={castSheet.status}
              castSheet={castSheet.sheet}
              onCastSheetChange={castSheet.setSheet}
              onCastSheetRefetch={() =>
                castSheet.refetch(
                  fileContentRef.current,
                  movieInfoRef.current,
                  targetLang,
                )
              }
              etaSeconds={etaSeconds}
              onStart={() => handleTranslate(model)}
            />
          </>
        )}

        {!refusal && screen === 'progress' && (
          <ProgressStep
            progress={translationProgress}
            totalLines={totalLines}
            onCancel={handleCancel}
            enrichDone={ENRICH_ALWAYS_DONE}
            glossaryEnabled={castSheet.enabled}
            glossaryDone={castSheet.status !== 'extracting'}
          />
        )}

        {!refusal && screen === 'done' && result && (
          <DoneStep
            result={result}
            movieInfo={movieInfo}
            castSheet={castSheet.enabled ? castSheet.sheet : undefined}
            jobId={jobId}
            onStartOver={resetAll}
          />
        )}
        </>
        )}
      </main>

      <footer className='w-full max-w-[600px] lg:max-w-[840px] mx-auto px-5 pb-10 text-center text-ink-3'>
        <p className='mono text-[12px]'>v{APP_VERSION} · Beta</p>
        <p className='text-[12px] mt-1'>© 2026 ZAMAK. All rights reserved.</p>
        <div className='flex items-center justify-center gap-2.5 mt-1 text-[12px]'>
          <a href={`mailto:${COPY.footer.feedbackEmail}`} className='underline'>
            {COPY.footer.feedback}
          </a>
          <span className='dot-sep' />
          <Link href={COPY.legal.termsHref} className='underline'>
            {COPY.legal.terms}
          </Link>
          <span className='dot-sep' />
          <Link href={COPY.legal.privacyHref} className='underline'>
            {COPY.legal.privacy}
          </Link>
        </div>
      </footer>
    </div>
  );
}
