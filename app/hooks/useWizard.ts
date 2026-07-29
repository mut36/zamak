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
  /** True while a just-selected file is being read (parse happens before the
   *  screen switches to 'settings' — see handleFile), so the upload screen
   *  can show a "reading…" state instead of looking stuck. */
  uploading: boolean;
  /** Name of the file being read, for the "reading…" message. */
  uploadingFileName: string;
  summarizing: boolean;
  /** True once the work has been confirmed (explicitly or via the banner). */
  workConfirmed: boolean;
  /** True when the work came from a single confident match, so the settings
   *  screen shows the confirm banner instead of a settled card. */
  autoMatched: boolean;
  /** Movie branch: index of the highlighted candidate card on the work-pick
   *  screen. -1 means nothing picked yet. */
  selectedIndex: number;
  /** Other branch: the chosen content-type chip label (one of
   *  COPY.workPick.otherTypes). */
  otherType: string;
  /** Other branch: free-text tone/manner for the work-pick screen. */
  toneText: string;
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
  const [uploading, setUploading] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [workConfirmed, setWorkConfirmed] = useState(false);
  const [autoMatched, setAutoMatched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [otherType, setOtherType] = useState('');
  const [toneText, setToneText] = useState('');

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
    // `data` (the just-awaited return value) disambiguates a confident match
    // reliably even though `enrichStatus` read here is a possibly-stale
    // render-time closure value (see nextScreenAfterUpload's doc comment) —
    // enrichStatus is only used to distinguish 'ambiguous' from 'notFound',
    // both of which route to the same place ('workPick'), so a stale read
    // between those two never produces a wrong screen.
    const matched = data !== null;
    setAutoMatched(matched);
    setWorkConfirmed(false);
    setScreen(nextScreenAfterUpload(matched ? 'found' : enrichStatus));
  }, [enrich, enrichStatus]);

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
    if (screen !== 'workPick') return;
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
    setSelectedIndex(-1);
    setOtherType('');
    setToneText('');
  };

  const handleFile = async (selected: File) => {
    // Defensive: the upload screen locks the dropzone while contentType is
    // null, so this should be unreachable, but never process a file dropped
    // before a type is picked.
    if (contentType === null) return;

    setUploading(true);
    setUploadingFileName(selected.name);

    if (!isSupportedSubtitleFilename(selected.name)) {
      setUploadError(messages.upload.invalidFile);
      setUploading(false);
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
      setUploading(false);
      return;
    }

    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Screen goes to 'workPick' immediately — the movie branch's TMDB search
    // and the other branch's summarize both run while it's showing, so the
    // user sees a live "searching"/analyzing state on the work-pick screen
    // itself rather than looking stuck on upload.
    processFile(selected, doc);
    setUploading(false);
    setScreen('workPick');
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
    setUploading(false);
    setUploadingFileName('');
    setContentType(null);
    setWorkConfirmed(false);
    setAutoMatched(false);
    setSelectedIndex(-1);
    setOtherType('');
    setToneText('');
    setScreen('upload');
  };

  const confirmWork = useCallback(() => {
    setWorkConfirmed(true);
  }, []);

  // Manual re-search for the work-pick screen's "찾는 작품이 없어요" toggle —
  // empty year, since the user is searching by a new title and the file's
  // originally-guessed year no longer applies.
  const searchWork = useCallback(
    (query: string) => {
      enrich(query, '');
    },
    [enrich],
  );

  const confirmWorkPick = useCallback(() => {
    if (contentType === 'movie') {
      const candidate = enrichCandidates[selectedIndex];
      if (!candidate) return;
      (async () => {
        await runSelectCandidate(candidate);
        setWorkConfirmed(true);
        // A manual pick, not the auto-confident-match path the settings
        // screen's confirm banner is for.
        setAutoMatched(false);
        setScreen('settings');
      })();
    } else if (contentType === 'other') {
      setMovieInfo((prev) => ({ ...prev, genre: otherType, tone: toneText }));
      setScreen('settings');
    }
  }, [contentType, enrichCandidates, selectedIndex, runSelectCandidate, otherType, toneText]);

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
    uploading,
    uploadingFileName,
    summarizing,
    workConfirmed,
    autoMatched,
    selectedIndex,
    otherType,
    toneText,
  };

  return {
    ...state,
    setContentType,
    setTargetLang,
    setMovieInfo,
    setSelectedIndex,
    setOtherType,
    setToneText,
    confirmWork,
    goWorkPick,
    searchWork,
    confirmWorkPick,
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
