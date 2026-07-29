'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation, type TranslationMessages } from './useTranslation';
import { useEnrich, type EnrichCandidate, type EnrichStatus } from './useEnrich';
import { useCastSheet } from './useCastSheet';
import { parseSrtBlocks } from '../lib/srt';
import {
  BilingualSmiError,
  isSupportedSubtitleFilename,
  loadSubtitleFile,
} from '../lib/subtitles';
import { DEFAULT_TARGET_LANG } from '../config/languages';
import type { AllowedModel } from '../config/constants';
import type { ContentType, MovieInfo } from '../types/translation';

const EMPTY_MOVIE_INFO: MovieInfo = { title: '', year: '', notes: '' };

/**
 * A bilingual SAMI is the one failure with a fix the user can act on (upload a
 * single-language file), so it gets its own message. Everything else — an
 * unrecognized body, no cues, a decode failure — reads the same from here.
 */
function uploadErrorMessage(err: unknown, messages: WizardMessages['upload']): string {
  return err instanceof BilingualSmiError
    ? messages.bilingualSmi
    : messages.unreadableFile;
}

/**
 * Every user-facing string the wizard needs, passed in rather than imported
 * from COPY — same convention useTranslation follows, so the hook stays
 * locale-agnostic and untestable-without-copy mistakes fail loudly instead of
 * silently surfacing an English default in the Korean UI.
 */
export interface WizardMessages {
  translate: TranslationMessages;
  upload: {
    bilingualSmi: string;
    unreadableFile: string;
    invalidFile: string;
  };
  cancelConfirm: string;
}

/** Screens the signed-in wizard can be on. */
export type WizardScreen =
  | 'upload'
  | 'workPick'
  | 'settings'
  | 'progress'
  | 'done'
  | 'exhausted';

/**
 * Where to go once a file is read and the work search has settled.
 *
 * A confident match skips the picker: it is confirmed inline on the settings
 * screen instead, because a list of one asks the user nothing.
 *
 * Driven by the search's own status, not by how many candidates came back —
 * useEnrich clears `candidates` to [] on a confident match, so a length check
 * would route every auto-matched film into an empty picker.
 */
export function nextScreenAfterUpload(status: EnrichStatus): WizardScreen {
  return status === 'found' ? 'settings' : 'workPick';
}

export interface WizardState {
  screen: WizardScreen;
  contentType: ContentType | null;
  targetLang: string;
  movieInfo: MovieInfo;
  uploadError: string;
  summarizing: boolean;
  /** True once the work has been confirmed (explicitly or via the banner). */
  workConfirmed: boolean;
  /** True when the work came from a single confident match, so the settings
   *  screen shows the confirm banner instead of a settled card. */
  autoMatched: boolean;
}

/**
 * The wizard's screen-transition state machine, plus everything it drives
 * (translation, enrichment, cast-sheet extraction). Pulled out of page.tsx so
 * that file can stay render-only.
 *
 * This is a pure extraction of the previous inline implementation — no
 * transition here behaves differently than it did in page.tsx. `screen`
 * replaces the old numeric `step` (0-3) one-for-one; `workConfirmed` and
 * `autoMatched` are new fields with no reader yet (Task 12 wires the
 * work-confirmation banner into them).
 */
export function useWizard(
  messages: WizardMessages,
  /** Called once a translation attempt (success or failure) settles, so the
   *  header's credit display catches up — the balance moves either way: a
   *  success spends the credit, and a refusal means the cached number was
   *  stale. Owned by page.tsx (via useAuth) since credits are auth/payment
   *  UI chrome, not wizard state. */
  refreshBalance: () => void,
) {
  const [screen, setScreen] = useState<WizardScreen>('upload');
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [targetLang, setTargetLang] = useState<string>(DEFAULT_TARGET_LANG);
  const [movieInfo, setMovieInfo] = useState<MovieInfo>(EMPTY_MOVIE_INFO);
  const [uploadError, setUploadError] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [workConfirmed, setWorkConfirmed] = useState(false);
  const [autoMatched, setAutoMatched] = useState(false);

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
    processFile,
    translate,
    cancelTranslation,
    clearFile,
  } = useTranslation(messages.translate, onMetaUpdate);

  const {
    status: enrichStatus,
    director,
    error: enrichError,
    candidates: enrichCandidates,
    enrich,
    selectCandidate,
    reset: resetEnrich,
  } = useEnrich();

  const castSheet = useCastSheet();

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

  // Movie branch: one unified lookup (TMDB first, grounded search fallback —
  // see enrichMovie() server-side). title/year/director/poster are UI-facing
  // and overwrite the filename-guessed values with the authoritative ones;
  // genre/era/tone are AI-facing keyword fields, never rendered. `notes`
  // stays untouched here — it is the user's own free-text field.
  const runEnrich = useCallback(async () => {
    const { title, year } = movieInfoRef.current;
    const data = await enrich(title, year);
    setMovieInfo((prev) => ({
      ...prev,
      posterUrl: data?.posterUrl ?? undefined,
      title: data?.found && data.title ? data.title : prev.title,
      year: data?.found && data.year ? data.year : prev.year,
      genre: data?.found ? data.genre : '',
      era: data?.found ? data.era : '',
      tone: data?.found ? data.tone : '',
    }));
  }, [enrich]);

  // User picked one of several TMDB matches from the ambiguous-search
  // candidate list (InfoStep) — resolve that specific work the same way
  // runEnrich merges an auto-resolved one.
  const runSelectCandidate = useCallback(
    async (candidate: EnrichCandidate) => {
      const { title, year } = movieInfoRef.current;
      const data = await selectCandidate(candidate, title, year);
      setMovieInfo((prev) => ({
        ...prev,
        posterUrl: data?.posterUrl ?? undefined,
        title: data?.found && data.title ? data.title : prev.title,
        year: data?.found && data.year ? data.year : prev.year,
        genre: data?.found ? data.genre : '',
        era: data?.found ? data.era : '',
        tone: data?.found ? data.tone : '',
      }));
    },
    [selectCandidate],
  );

  // Auto-analyze once per file: movie → web-search enrich + TMDB poster,
  // other → summarize. Guarded by refs so returning never re-triggers.
  useEffect(() => {
    if (screen !== 'settings') return;
    if (contentType === null) return;
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
  }, [screen, contentType, analysis.completed, fileContent, runEnrich]);

  // Cast-sheet prepass: independent opt-in toggle (see docs/decisions.md).
  // request() no-ops while already in flight/done for this file (internal
  // ref guard), so firing this effect on every fileContent/enabled change is
  // safe — it only actually dispatches once per file, and only when enabled.
  const castSheetEnabled = castSheet.enabled;
  const requestCastSheet = castSheet.request;
  useEffect(() => {
    if (screen !== 'settings') return;
    if (!castSheetEnabled) return;
    if (!fileContent) return;
    requestCastSheet(fileContentRef.current, movieInfoRef.current, targetLang);
  }, [screen, castSheetEnabled, fileContent, requestCastSheet, targetLang]);

  const resetAnalysis = () => {
    enrichStartedRef.current = false;
    summarizeStartedRef.current = false;
    resetEnrich();
    castSheet.reset();
    setSummarizing(false);
  };

  const handleFile = async (selected: File) => {
    if (!isSupportedSubtitleFilename(selected.name)) {
      setUploadError(messages.upload.invalidFile);
      return;
    }
    setUploadError('');

    // Parsing is awaited here rather than inside the hook so a file we can't
    // use never leaves this screen: the error belongs next to the dropzone,
    // not on the info step behind a spinner.
    let doc;
    try {
      doc = await loadSubtitleFile(selected);
    } catch (err) {
      setUploadError(uploadErrorMessage(err, messages.upload));
      return;
    }

    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Screen goes to 'settings' immediately so the "분석 중" spinner covers the wait.
    processFile(selected, doc);
    setScreen('settings');
  };

  const handleTranslate = async (model: AllowedModel) => {
    setScreen('progress');
    // Give a still-running extraction a bounded grace period rather than
    // blocking indefinitely or always shipping without it — see
    // GLOSSARY_WAIT_MS. Never called (resolves immediately) when the toggle
    // is off, since no extraction was ever kicked off.
    const resolvedCastSheet = castSheet.enabled
      ? await castSheet.awaitReady()
      : undefined;
    // translate() resolves true on success, false on error/abort/refusal.
    const ok = await translate(
      movieInfo,
      model,
      targetLang,
      'meaning',
      undefined,
      resolvedCastSheet,
    );
    // The balance moved either way: a success spent the credit, and a refusal
    // means our cached number was stale.
    refreshBalance();
    setScreen(ok ? 'done' : 'settings');
  };

  const handleCancel = () => {
    if (confirm(messages.cancelConfirm)) {
      cancelTranslation();
      setScreen('settings');
    }
  };

  const resetAll = () => {
    cancelTranslation();
    clearFile();
    resetAnalysis();
    setMovieInfo(EMPTY_MOVIE_INFO);
    setUploadError('');
    setContentType(null);
    setWorkConfirmed(false);
    setAutoMatched(false);
    setScreen('upload');
  };

  const confirmWork = useCallback(() => {
    setWorkConfirmed(true);
  }, []);

  const goWorkPick = useCallback(() => {
    setScreen('workPick');
  }, []);

  const goScreen = useCallback((next: WizardScreen) => {
    setScreen(next);
  }, []);

  const state: WizardState = {
    screen,
    contentType,
    targetLang,
    movieInfo,
    uploadError,
    summarizing,
    workConfirmed,
    autoMatched,
  };

  return {
    ...state,
    setContentType,
    setTargetLang,
    setMovieInfo,
    confirmWork,
    goWorkPick,
    handleFile,
    handleTranslate,
    handleCancel,
    resetAll,
    goScreen,
    // Passed through from useTranslation for the screens that still render
    // against it directly.
    fileContent,
    error,
    analysis,
    translationProgress,
    result,
    refusal,
    totalLines,
    // Passed through from useEnrich.
    enrichStatus,
    director,
    enrichError,
    enrichCandidates,
    runEnrich,
    runSelectCandidate,
    // Passed through from useCastSheet.
    castSheet,
    fileContentRef,
    movieInfoRef,
  };
}
