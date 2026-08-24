'use client';

import { useRouter } from 'next/navigation';
import { UploadStep } from '../simple/UploadStep';
import { WorkPickStep } from './WorkPickStep';
import { TranslateSettingsStep } from './TranslateSettingsStep';
import { ProgressStep } from '../simple/ProgressStep';
import { DoneStep } from '../simple/DoneStep';
import { ExhaustedStep } from './ExhaustedStep';
import { CopyrightModal } from './CopyrightModal';
import { FeedbackFollowup } from './FeedbackFollowup';
import { AppNav } from './AppNav';
import { SiteFooter } from '../SiteFooter';
import { useWizard, POST_UPLOAD_SCREEN } from '../../hooks/useWizard';
import { useAuth } from '../../hooks/useAuth';
import { useFeedbackFollowup } from '../../hooks/useFeedbackFollowup';
import { recordEvent } from '../../lib/client/events';
import { GLOSSARY_WAIT_MS } from '../../config/constants';
import { estimateRunMsFromBlocks } from '../../lib/progressEstimate';
import { COPY } from '../../i18n/simpleCopy';

// Work identification (enrich for the movie branch, otherType/toneText for
// the "other" branch) is always resolved by the time handleTranslate can
// even be called — it only fires from the settings screen, which is reached
// through confirmWorkPick or the settings screen's own confirm banner, both
// of which settle movieInfo first. overallPercent's `enrichDone: false`
// branch exists for that function's own general behavior (its test suite
// covers it directly); it is not a state this wizard's wiring ever reaches,
// so ProgressStep always gets `true` here.
const ENRICH_ALWAYS_DONE = true;

/**
 * The signed-in half of `/`. The anonymous half is the landing page, and which
 * one renders is decided on the server now (app/page.tsx) rather than by a
 * client-side `authLoading` gate — that gate was returning a blank div in the
 * server HTML, so a crawler saw an empty document. See docs/decisions.md.
 *
 * Reaching this component therefore *means* there is a session: the two
 * `signedIn` booleans below are literal `true` rather than a `!!user` that
 * only settles after the client re-checks.
 */
export function WizardApp() {
  const router = useRouter();

  // Balances and email only — the session itself was settled server-side.
  const { credits, email, refreshBalance } = useAuth();

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
    loadedFileName,
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
    errorCreditSpent,
    totalLines,
    runtimeMinutes,
    uploadCredits,
    enrichStatus,
    enrichCandidates,
    castSheet,
    directorNote,
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
    goScreen,
    model,
    philosophyOn,
    setPhilosophyOn,
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
        noBlocks: COPY.upload.noBlocks,
      },
      cancelConfirm: COPY.progress.cancelConfirm,
      copyright: { failed: COPY.copyright.failed },
    },
    refreshBalance,
    true,
  );

  // Re-visit follow-up: "did you actually use it" can't be answered on the
  // completion screen, so it's asked once on app entry instead — see
  // useFeedbackFollowup and app/api/feedback/pending.
  const { item: pendingFeedback, clear: clearPendingFeedback } =
    useFeedbackFollowup(true);

  // Settings screen's confirm banner vs. settled card — a single confident
  // TMDB match needs a yes/no before it's trusted, a manual pick or an
  // already-confirmed one doesn't.
  const needsConfirm = autoMatched && !workConfirmed;

  // 설정 화면 하단 바의 ETA 약속. 진행 바가 채워질 때 쓰는 것과 **같은 식**을
  // 쓴다 — 업로드 시점에 totalLines가 이미 잡혀 있으므로 파일 크기를 반영할 수
  // 있다. decisions.md §2-7이 걱정했던 "같은 화면에서 카피와 링이 다른 시간을
  // 말한다"가 여기서 해소된다: 두 숫자가 한 함수에서 나온다.
  //
  // 프리패스 유예(`GLOSSARY_WAIT_MS`)를 더하는 항은 **지금 실제로 도는 프리패스**를
  // 봐야 한다. 글로사리를 끄고 연출 메모로 갈아탈 때(2026-08-21) 이 항이
  // castSheet만 보고 있어서, 프로가 메모를 기다리는 시간만큼 약속이 짧아졌다.
  const prepassRuns = castSheet.enabled || directorNote.enabled;
  const etaSeconds = Math.round(
    (estimateRunMsFromBlocks(totalLines, model) +
      (prepassRuns ? GLOSSARY_WAIT_MS : 0)) /
      1000,
  );

  const resetAll = resetWizard;

  return (
    <div>
      <div className='page-fold'>
        <AppNav
          credits={credits}
          onHome={resetAll}
        />

        <main className='w-full max-w-[840px] mx-auto px-5 sm:px-10 pt-4 sm:pt-16 pb-20 flex-1'>
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
              fileName={loadedFileName || undefined}
              lineCount={totalLines}
              credits={uploadCredits}
              error={uploadError}
              onFile={handleFile}
              onNext={() => goScreen(POST_UPLOAD_SCREEN)}
            />
          )}

          {!refusal && screen === 'workPick' && (
            <WorkPickStep
              contentType={contentType ?? 'movie'}
              fileName={loadedFileName}
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
                  {/* Only when the run had already opened a job — a failure
                      before that (file analysis, an empty parse) cost nothing,
                      and promising a refund there would be noise. */}
                  {errorCreditSpent && (
                    <p className='mt-2 text-fineprint text-secondary'>
                      {COPY.error.creditNote}{' '}
                      <a
                        href={`mailto:${COPY.footer.feedbackEmail}`}
                        className='underline'
                      >
                        {COPY.footer.feedbackEmail}
                      </a>
                    </p>
                  )}
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
                philosophyOn={philosophyOn}
                onPhilosophyOn={setPhilosophyOn}
                credits={credits}
                targetLang={targetLang}
                blockCount={totalLines}
                runtimeMinutes={runtimeMinutes}
                castSheetStatus={castSheet.status}
                castSheet={castSheet.sheet}
                onCastSheetChange={castSheet.setSheet}
                onCastSheetRefetch={() =>
                  castSheet.refetch(
                    fileContentRef.current,
                    movieInfoRef.current,
                    targetLang,
                    model,
                  )
                }
                directorNoteStatus={directorNote.status}
                onDirectorNoteRefetch={() =>
                  directorNote.refetch(
                    fileContentRef.current,
                    movieInfoRef.current,
                    targetLang,
                    model,
                    // 사용자가 "다시 쓰기"를 눌렀다는 것은 기존 메모를 버리겠다는
                    // 뜻이다(누르기 전에 확인을 받는다). 그래서 여기서는 자동
                    // 채우기의 `prev.notes ||` 가드를 쓰지 않고 통째로 바꾼다.
                    (note) => setMovieInfo((prev) => ({ ...prev, notes: note })),
                  )
                }
                etaSeconds={etaSeconds}
                creditCost={uploadCredits}
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
              model={model}
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
              required={refusal.required}
              have={refusal.have}
              defaultEmail={email ?? ''}
              onGoHistory={() => router.push('/mypage')}
              onBack={clearRefusal}
            />
          )}

          {/* 'file_too_large' no longer exists — a long file spends more
              credits instead of being refused (§6-22), so the screen that used
              to sit here was removed with the 413. */}

          {/* unauthorized / unknown: the documented screen does not apply (not
              a credits problem), so this falls back to the app's generic error
              copy. */}
          {refusal && refusal.code !== 'insufficient_credits' && (
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
      </div>

      <SiteFooter
        withBottomBar={
          !refusal &&
          (screen === 'upload' || screen === 'settings' || screen === 'workPick')
        }
      />
    </div>
  );
}
