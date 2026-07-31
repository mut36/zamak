'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadStep } from './components/simple/UploadStep';
import { WorkPickStep } from './components/beta/WorkPickStep';
import { TranslateSettingsStep } from './components/beta/TranslateSettingsStep';
import { ProgressStep } from './components/simple/ProgressStep';
import { DoneStep } from './components/simple/DoneStep';
import { LandingPage } from './components/simple/LandingPage';
import { ExhaustedStep } from './components/beta/ExhaustedStep';
import { CopyrightModal } from './components/beta/CopyrightModal';
import { FeedbackFollowup } from './components/beta/FeedbackFollowup';
import { AppNav } from './components/beta/AppNav';
import { SiteFooter } from './components/SiteFooter';
import { useWizard } from './hooks/useWizard';
import { useAuth } from './hooks/useAuth';
import { useFeedbackFollowup } from './hooks/useFeedbackFollowup';
import { isSupabaseConfigured } from './lib/supabase/env';
import { recordEvent } from './lib/client/events';
import { estimateTranslationMs, GLOSSARY_WAIT_MS } from './config/constants';
import { COPY } from './i18n/simpleCopy';

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
    showConsentModal,
    consentPending,
    consentError,
    handleAgreeConsent,
  } = useWizard(
    {
      translate: COPY.translateErrors,
      upload: {
        bilingualSmi: COPY.upload.bilingualSmi,
        unreadableFile: COPY.upload.unreadableFile,
        invalidFile: COPY.upload.invalidFile,
      },
      cancelConfirm: COPY.progress.cancelConfirm,
      copyright: { failed: COPY.copyright.failed },
    },
    refreshBalance,
    !!user,
  );

  // Re-visit follow-up: "did you actually use it" can't be answered on the
  // completion screen, so it's asked once on app entry instead — see
  // useFeedbackFollowup and app/api/feedback/pending.
  const { item: pendingFeedback, clear: clearPendingFeedback } =
    useFeedbackFollowup(!!user);

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

  const resetAll = resetWizard;

  // OAuth is the one round-trip that leaves the app and reports back through a
  // query param. Read it once, then clean the URL so a refresh does not
  // re-show a stale banner. (The payment window was the other one; it lives on
  // feature/payments until Toss merchant review clears.)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get('auth_error')) return;

    // This effect only runs to sync a one-time redirect query param into
    // state on mount (an external system, per the rule's own carve-out) —
    // there is no render-time equivalent for "the URL said auth failed".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthError(COPY.auth.failed);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Auth is the outermost gate: every route that spends the server key is
  // closed to anonymous callers, so there is nothing to show behind it.
  if (authLoading) {
    return <div className='min-h-screen' aria-busy='true' />;
  }

  if (!user) {
    // 비로그인 `/`는 마케팅 랜딩(design_handoff_zamak_landing)이다. 앱 셸의
    // 폭 제한·nav·푸터를 쓰지 않고 랜딩이 자기 chrome(sticky nav, 풀블리드
    // 섹션, 푸터)을 직접 갖는다.
    return (
      <LandingPage
        onSignIn={signIn}
        error={authError}
        configured={isSupabaseConfigured}
      />
    );
  }

  return (
    <div className='min-h-screen'>
      <AppNav
        user={user}
        signOut={signOut}
        credits={credits}
        onHome={resetAll}
      />

      <main className='w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-20'>
        {/* Mandatory first-translation gate: a fixed full-screen overlay with
            no close affordance, over whichever screen is showing (the wizard
            stays on 'settings' behind it). */}
        {showConsentModal && (
          <CopyrightModal
            onAgree={handleAgreeConsent}
            pending={consentPending}
            error={consentError}
          />
        )}

        {!refusal && screen === 'upload' && pendingFeedback && (
          <FeedbackFollowup item={pendingFeedback} onDone={clearPendingFeedback} />
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
              // Same condition the picker uses — settings now owns the wait,
              // since upload hands off before the TMDB search settles.
              searching={
                analysis.isAnalyzing ||
                enrichStatus === 'searching' ||
                enrichStatus === 'idle'
              }
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
              onStart={() => {
                void recordEvent('settings_confirmed', {
                  contentType: contentType ?? 'movie',
                  model,
                  glossaryEnabled: castSheet.enabled,
                  targetLang,
                });
                handleTranslate(model);
              }}
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

        {refusal && refusal.code === 'insufficient_credits' && (
          <ExhaustedStep
            kind={refusal.kind ?? 'lite'}
            defaultEmail={email ?? ''}
            onGoHistory={() => router.push('/mypage')}
            onBack={clearRefusal}
          />
        )}

        {refusal && refusal.code === 'file_too_large' && (
          <div className='animate-zslide'>
            <div className='head text-center mb-7'>
              <h1>{COPY.credits.tooLargeTitle}</h1>
              <p>{COPY.credits.tooLargeBody(refusal.maxBlocks ?? 0, totalLines)}</p>
            </div>

            <div className='card p-[22px] flex flex-col items-center gap-3'>
              <button type='button' className='btn btn-primary w-full' onClick={resetAll}>
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
            <div className='animate-zslide'>
              <div className='head text-center mb-7'>
                <h1>{COPY.error.title}</h1>
                <p>{COPY.error.body}</p>
              </div>

              <div className='card p-[22px] flex flex-col items-center gap-3'>
                <button type='button' className='btn btn-primary w-full' onClick={resetAll}>
                  {COPY.error.retry}
                </button>
              </div>
            </div>
          )}
      </main>

      <SiteFooter />
    </div>
  );
}
