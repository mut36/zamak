'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation, type TranslationMessages } from './useTranslation';
import { useEnrich, type EnrichCandidate, type EnrichResult } from './useEnrich';
import { useCastSheet } from './useCastSheet';
import { parseSrtBlocks } from '../lib/srt';
import {
  BilingualSmiError,
  isSupportedSubtitleFilename,
  loadSubtitleFile,
} from '../lib/subtitles';
import { fetchConsent, recordConsent } from '../lib/client/consent';
import { recordEvent } from '../lib/client/events';
import { DEFAULT_TARGET_LANG } from '../config/languages';
import {
  DEFAULT_MODEL,
  MAX_BLOCKS_PER_CREDIT,
  type AllowedModel,
} from '../config/constants';
import type { ContentType, MovieInfo } from '../types/translation';

const EMPTY_MOVIE_INFO: MovieInfo = { title: '', year: '', notes: '' };

/** Extension for an upload_rejected event's `format` detail — a display-only
 *  read, not the format-detection logic in lib/subtitles/detect.ts. */
function fileExtension(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

/**
 * Blocks in a parsed document, counted exactly the way the server counts them.
 *
 * `useTranslation` sends `parseSrtBlocks(doc.srt).length` to
 * /api/translation/begin, which compares it against MAX_BLOCKS_PER_CREDIT. The
 * upload guard has to agree with that number or it would refuse files the
 * server would accept (or worse, pass files it will reject), so both go
 * through this one parse rather than counting cues or lines independently.
 */
export function countBlocks(srt: string): number {
  return parseSrtBlocks(srt).length;
}

/**
 * Whether a file is too big to translate on one credit.
 *
 * Strictly greater-than, matching /api/translation/begin — a file of exactly
 * MAX_BLOCKS_PER_CREDIT blocks is allowed. Exported for the test that pins
 * that boundary; the two checks drifting by one block would either leak spend
 * or reject a legal file.
 */
export function exceedsCreditCap(blockCount: number): boolean {
  return blockCount > MAX_BLOCKS_PER_CREDIT;
}

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
    /** (상한, 실제) — 크레딧 상한을 넘는 파일을 드롭존에서 돌려보낼 때. */
    tooLarge: (max: number, actual: number) => string;
  };
  cancelConfirm: string;
  copyright: {
    failed: string;
  };
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
 * The screen the upload handoff lands on — and therefore the screen the
 * auto-analysis effect has to watch for.
 *
 * One constant for both, because they drifted apart once and the drift was
 * silent: the handoff moved from 'workPick' to 'settings' while the effect
 * kept waiting for 'workPick', so runEnrich() never fired. Nothing errored —
 * enrichStatus simply stayed 'idle', which the settings screen renders as
 * "검색 중", so the spinner span forever and no /api/enrich request was ever
 * made. Never write either screen name literally at those two sites again.
 */
export const POST_UPLOAD_SCREEN: WizardScreen = 'settings';

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
  /** Currently-selected translation model on the settings screen — persists
   *  across re-renders (and back-navigation from a failed translate) so the
   *  chosen card stays highlighted instead of resetting to the default. */
  model: AllowedModel;
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
  /** Whether a user is signed in. The wizard renders on every visit (page.tsx
   *  calls this hook before its auth gate), so the consent lookup keys on this
   *  flag instead of firing for anonymous visitors who can never translate. */
  signedIn: boolean,
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
  const [model, setModel] = useState<AllowedModel>(DEFAULT_MODEL);

  // Copyright-consent gate (see handleTranslate). consentAgreed starts false
  // and fetchConsent fails closed, so a lookup that never lands just means the
  // user sees the notice once more — never that they skip it.
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentPending, setConsentPending] = useState(false);
  const [consentError, setConsentError] = useState('');

  useEffect(() => {
    if (!signedIn) return;
    let stale = false;
    fetchConsent().then((agreed) => {
      if (!stale) setConsentAgreed(agreed);
    });
    return () => {
      stale = true;
    };
  }, [signedIn]);

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
    jobId,
    errorCreditSpent,
    processFile,
    translate,
    cancelTranslation,
    clearFile,
    clearRefusal,
  } = useTranslation(messages.translate, onMetaUpdate);

  const {
    status: enrichStatus,
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

  // Shared by runEnrich and runSelectCandidate: merge a resolved (or failed)
  // lookup into movieInfo. title/year/director/poster are UI-facing and
  // overwrite the filename-guessed values with the authoritative ones;
  // genre/era/tone are AI-facing keyword fields, never rendered. `notes`
  // stays untouched here — it is the user's own free-text field.
  const applyEnrichResult = useCallback((data: EnrichResult | null) => {
    setMovieInfo((prev) => ({
      ...prev,
      posterUrl: data?.posterUrl ?? undefined,
      title: data?.found && data.title ? data.title : prev.title,
      year: data?.found && data.year ? data.year : prev.year,
      director: data?.found ? (data.director ?? undefined) : undefined,
      genre: data?.found ? data.genre : '',
      era: data?.found ? data.era : '',
      tone: data?.found ? data.tone : '',
    }));
  }, []);

  // User picked one of several TMDB matches from the ambiguous-search
  // candidate list (WorkPickStep, or runEnrich's own auto-pick below) —
  // resolve that specific work and merge it in. Returns the resolved result
  // so callers can tell a successful resolve from a failed one.
  const runSelectCandidate = useCallback(
    async (candidate: EnrichCandidate) => {
      const { title, year } = movieInfoRef.current;
      const data = await selectCandidate(candidate, title, year);
      applyEnrichResult(data);
      return data;
    },
    [selectCandidate, applyEnrichResult],
  );

  // Movie branch: one unified lookup (TMDB first, grounded search fallback —
  // see enrichMovie() server-side).
  //
  // A confident single match is confirmed inline on the settings screen
  // ("'X'로 인식했어요. 맞나요?"), because a list of one asks the user nothing.
  // An ambiguous search (several TMDB hits) auto-resolves its *first*
  // candidate the same way and shows the exact same confirm banner — the
  // full candidate list is never shown up front. Only when the user says
  // "이 작품이 아니에요" (onChangeWork → goWorkPick) does the picker with every
  // candidate appear; selectCandidate's preserveCandidatesOnFound keeps that
  // list alive in useEnrich's state for exactly that moment. Nothing was
  // found at all (or the auto-pick itself fails) is the only path that still
  // lands on the picker directly.
  const runEnrich = useCallback(async () => {
    const { title, year } = movieInfoRef.current;
    const { result, candidates } = await enrich(title, year);

    if (result) {
      applyEnrichResult(result);
      setAutoMatched(true);
      setWorkConfirmed(false);
      setScreen('settings');
      return;
    }

    if (candidates.length > 0) {
      setSelectedIndex(0);
      const picked = await runSelectCandidate(candidates[0]);
      setAutoMatched(picked !== null);
      setWorkConfirmed(false);
      setScreen(picked !== null ? 'settings' : 'workPick');
      return;
    }

    setAutoMatched(false);
    setWorkConfirmed(false);
    setScreen('workPick');
  }, [enrich, applyEnrichResult, runSelectCandidate]);

  // Auto-analyze once per file: movie → web-search enrich + TMDB poster,
  // other → summarize. Guarded by refs so returning never re-triggers.
  useEffect(() => {
    if (screen !== POST_UPLOAD_SCREEN) return;
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
    setUploading(true);
    setUploadingFileName(selected.name);

    if (!isSupportedSubtitleFilename(selected.name)) {
      setUploadError(messages.upload.invalidFile);
      setUploading(false);
      void recordEvent('upload_rejected', {
        reason: 'invalidFile',
        format: fileExtension(selected.name),
      });
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
      void recordEvent('upload_rejected', {
        reason: err instanceof BilingualSmiError ? 'bilingualSmi' : 'unreadable',
        format: fileExtension(selected.name),
      });
      return;
    }

    // Size check belongs HERE, not at translate time. /api/translation/begin
    // enforces MAX_BLOCKS_PER_CREDIT too (that check is the billing defense and
    // stays), but by then the settings screen has already fired enrich,
    // summarize and — if the toggle is on — a full glossary extraction. Those
    // are real API spend on a file we are about to refuse. Same parse the
    // server check uses, so the two can never disagree about the count.
    const blockCount = countBlocks(doc.srt);
    if (exceedsCreditCap(blockCount)) {
      setUploadError(messages.upload.tooLarge(MAX_BLOCKS_PER_CREDIT, blockCount));
      setUploading(false);
      void recordEvent('upload_rejected', {
        reason: 'tooLarge',
        format: fileExtension(selected.name),
      });
      return;
    }

    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Screen goes to 'settings' only when the user clicks 'Next' on the upload screen.
    // The TMDB search and the other branch's summarize both run
    // when settings is showing (it renders its own searching state).
    processFile(selected, doc);
    setUploading(false);
  };

  // The actual translate work, entered only once consent is settled — either
  // handleTranslate saw consentAgreed already true, or handleAgreeConsent just
  // recorded it.
  const startTranslate = async (model: AllowedModel) => {
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
      // Null only if the user somehow reached here without picking a type;
      // the upload screen's dropzone stays locked until they do.
      contentType ?? undefined,
    );
    // The balance moved either way: a success spent the credit, and a refusal
    // means our cached number was stale.
    refreshBalance();
    setScreen(ok ? 'done' : 'settings');
  };

  const handleTranslate = async (model: AllowedModel) => {
    // Consent gate: not agreed yet → modal over the settings screen (screen
    // deliberately stays 'settings' so nothing shifts behind the overlay).
    if (!consentAgreed) {
      setShowConsentModal(true);
      return;
    }
    await startTranslate(model);
  };

  // Modal's agree button. On a failed save the modal stays open with an error
  // — proceeding on an unsaved consent would leave no record, which defeats
  // the modal's purpose. On success, continues straight into the translation
  // the gate interrupted, using the wizard's own `model` state (the settings
  // screen set it before calling handleTranslate, so it's the same value).
  const handleAgreeConsent = async () => {
    setConsentPending(true);
    const ok = await recordConsent();
    setConsentPending(false);
    if (!ok) {
      setConsentError(messages.copyright.failed);
      return;
    }
    setConsentAgreed(true);
    setConsentError('');
    setShowConsentModal(false);
    await startTranslate(model);
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
    setModel(DEFAULT_MODEL);
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
      // A fresh search always replaces `candidates` with a new list, so any
      // prior selection into the old list must be cleared here — otherwise
      // the same index can point at a different, never-clicked film in the
      // new list and render as pre-selected.
      setSelectedIndex(-1);
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
    } else if (contentType !== null) {
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
    model,
  };

  return {
    ...state,
    setContentType,
    setTargetLang,
    setMovieInfo,
    setSelectedIndex,
    setOtherType,
    setToneText,
    setModel,
    confirmWork,
    goWorkPick,
    searchWork,
    confirmWorkPick,
    handleFile,
    handleTranslate,
    handleCancel,
    resetAll,
    goScreen,
    // Copyright-consent gate.
    showConsentModal,
    consentPending,
    consentError,
    handleAgreeConsent,
    // Passed through from useTranslation for the screens that still render
    // against it directly.
    fileContent,
    error,
    analysis,
    translationProgress,
    result,
    refusal,
    clearRefusal,
    jobId,
    errorCreditSpent,
    totalLines,
    // Passed through from useEnrich.
    enrichStatus,
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
