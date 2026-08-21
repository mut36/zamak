'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation, type TranslationMessages } from './useTranslation';
import { useEnrich, type EnrichCandidate, type EnrichResult } from './useEnrich';
import { useCastSheet } from './useCastSheet';
import { glossaryAppliesTo } from '../lib/glossaryGate';
import {
  parseBlockTiming,
  parseSrtBlocks,
  subtitleRuntimeMs,
} from '../lib/srt';
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
  creditsForBlocks,
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
 * /api/translation/begin, which divides it by BLOCKS_PER_CREDIT to price the
 * job. The upload screen has to arrive at the same number or it would quote a
 * charge the ledger then contradicts, so both go through this one parse rather
 * than counting cues or lines independently.
 */
export function countBlocks(srt: string): number {
  return parseSrtBlocks(srt).length;
}

/**
 * Credits this upload will spend, for the line the upload screen shows before
 * the user commits.
 *
 * Until 2026-08-21 this was `exceedsCreditCap` and a file over the cap was
 * turned away at the dropzone. There is no cap now — the same length that used
 * to be a refusal is a bigger number here.
 */
export function creditsForUpload(blockCount: number): number {
  return creditsForBlocks(blockCount);
}

/**
 * Whether a parsed document contains at least one block with real SRT timing.
 *
 * `countBlocks` just counts blank-line-separated paragraphs — that matches
 * the server's cap check on purpose (see above), but it means a .srt-named
 * file whose content isn't actually subtitles (prose, a bare VTT header,
 * garbage) still counts as N "blocks": `parseSrtBlocks` treats any non-blank
 * paragraph as one, with no structural check. `countBlocks` alone would let
 * that straight through to translate — a spent credit for nothing.
 *
 * Verified while adding this (2026-08-03): a genuinely *empty* block count
 * turns out unreachable once `EmptySubtitleError` has already ruled out a
 * blank document — `normalizeSrt` only trims, so any non-blank document
 * survives as at least one non-blank paragraph. Checked this directly rather
 * than assume it: every non-blank probe input (`"nonsense"`, a lone `WEBVTT`
 * line, null bytes, zero-width space) parsed to exactly 1 block, never 0. The
 * actual gap is **validity**, not count, so that's what this checks instead.
 */
function hasAnyValidTiming(srt: string): boolean {
  return parseSrtBlocks(srt).some((block) => parseBlockTiming(block) !== null);
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

/** Why an upload was turned away, in the shape `recordEvent` wants. */
export type UploadRejection =
  | 'invalidFile'
  | 'bilingualSmi'
  | 'unreadable'
  | 'noBlocks';

export type UploadInspection =
  | {
      ok: true;
      doc: Awaited<ReturnType<typeof loadSubtitleFile>>;
      /** Blocks in the accepted document — what the charge is derived from. */
      blockCount: number;
    }
  | { ok: false; reason: UploadRejection; message: string };

/**
 * The whole accept/reject decision for a dropped file, with no state in it.
 *
 * Pulled out of `handleFile` because the cascade used to be interleaved with
 * `setState` calls, and that is exactly how the replace-upload bug got in: the
 * file name was published *before* the checks ran, and none of the three early
 * returns took it back. The screen then showed the rejected file's name over
 * the previous file's content, with the Next button still live — so the user
 * pressed translate on B and paid a credit to translate A.
 *
 * With the decision separated from the writes, a rejection has nothing to undo:
 * `handleFile` cannot publish anything until this returns `ok`. The refusal
 * paths are pinned in useWizard.test.ts.
 *
 * Order matters and is not arbitrary — filename before parse before timing, so
 * we never spend a decode on a file the extension already disqualifies, and
 * never count blocks on a document that failed to parse.
 */
export async function inspectUpload(
  selected: File,
  messages: WizardMessages['upload'],
): Promise<UploadInspection> {
  if (!isSupportedSubtitleFilename(selected.name)) {
    return { ok: false, reason: 'invalidFile', message: messages.invalidFile };
  }

  let doc: Awaited<ReturnType<typeof loadSubtitleFile>>;
  try {
    doc = await loadSubtitleFile(selected);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof BilingualSmiError ? 'bilingualSmi' : 'unreadable',
      message: uploadErrorMessage(err, messages),
    };
  }

  // Counted here rather than at translate time so the upload screen can quote
  // the charge on the spot. Same parse /api/translation/begin prices from, so
  // the quote and the ledger can never disagree about the count.
  const blockCount = countBlocks(doc.srt);

  // A .srt-named file whose body isn't actually subtitles (a VTT saved with
  // the wrong extension, common from YouTube; a bare text file) parses
  // without throwing and without ever being caught above — EmptySubtitleError
  // only catches a fully blank/whitespace file, and every non-blank file
  // survives as at least one "block" no matter how unstructured its content
  // (see hasAnyValidTiming's doc comment). Neither of those checks notices
  // that block has no real timing, so it reached translate: a spent credit
  // for a file that produces nothing.
  if (!hasAnyValidTiming(doc.srt)) {
    return { ok: false, reason: 'noBlocks', message: messages.noBlocks };
  }

  return { ok: true, doc, blockCount };
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
    /** 파싱은 됐지만 자막 블록이 0개일 때 — 확장자만 .srt인 다른 포맷 파일 등. */
    noBlocks: string;
  };
  /** (차감 장수) — 이미 시작된 번역을 취소할 때. */
  cancelConfirm: (credits: number) => string;
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
  /**
   * Name of the file being read *right now*, for the "reading…" message.
   *
   * Not the loaded file — a rejected upload leaves its name here. Anything
   * that means "the file we are going to translate" must read
   * `loadedFileName` instead; conflating the two is what let a rejected
   * replace-upload put file B's name on file A's content.
   */
  uploadingFileName: string;
  /**
   * Name of the file whose content is in `fileContent` — empty until one
   * parses successfully, and unchanged by a rejected upload. This is the name
   * every screen should show.
   */
  loadedFileName: string;
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
  const [loadedFileName, setLoadedFileName] = useState('');
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
    creditsSpent,
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

  const castSheet = useCastSheet(glossaryAppliesTo(model));

  const totalLines = useMemo(
    () => (fileContent ? parseSrtBlocks(fileContent).length : 0),
    [fileContent],
  );

  /**
   * 자막이 덮는 영상 길이(분, 반올림). 타임코드가 없으면 null — 견적 줄이
   * 분을 빼고 줄·장만 말한다.
   *
   * `totalLines`와 같은 자리에서 같은 원본으로 뽑는다. 둘이 다른 시점의
   * 파일을 보면 견적 한 줄 안에서 줄 수와 분이 어긋난다.
   */
  const runtimeMinutes = useMemo(() => {
    if (!fileContent) return null;
    const ms = subtitleRuntimeMs(fileContent);
    return ms === null ? null : Math.round(ms / 60_000);
  }, [fileContent]);

  /**
   * Credits the loaded file will spend, shown before the user commits.
   *
   * Zero with no file loaded, which is how the upload screen tells "nothing to
   * quote yet" from "this one is free" — nothing is free.
   */
  const uploadCredits = useMemo(
    () => (totalLines > 0 ? creditsForUpload(totalLines) : 0),
    [totalLines],
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
    requestCastSheet(
      fileContentRef.current,
      movieInfoRef.current,
      targetLang,
      model,
    );
  }, [screen, castSheetEnabled, fileContent, requestCastSheet, targetLang, model]);

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
    // `uploadingFileName` is only ever the file being read right now — it
    // drives the "reading…" line and nothing else. Naming the file the user
    // just dropped is safe here precisely because no other screen reads it.
    setUploading(true);
    setUploadingFileName(selected.name);

    // Parsing is awaited here rather than inside the hook so a file we can't
    // use never leaves this screen: the error belongs next to the dropzone,
    // not on the info step behind a spinner.
    const inspected = await inspectUpload(selected, messages.upload);

    if (!inspected.ok) {
      setUploadError(inspected.message);
      setUploading(false);
      void recordEvent('upload_rejected', {
        reason: inspected.reason,
        format: fileExtension(selected.name),
      });
      // Deliberately leaves `loadedFileName` and `fileContent` alone. On a
      // replace-upload they still describe the previous, still-usable file,
      // and that is what the screen goes back to showing.
      return;
    }

    setUploadError('');
    setMovieInfo(EMPTY_MOVIE_INFO);
    resetAnalysis();
    // Only now does the file become "the loaded one". This assignment and
    // processFile below must stay together — `loadedFileName` names whatever
    // is in `fileContent`, and the upload screen trusts that pairing.
    setLoadedFileName(selected.name);
    // Screen goes to 'settings' only when the user clicks 'Next' on the upload screen.
    // The TMDB search and the other branch's summarize both run
    // when settings is showing (it renders its own searching state).
    processFile(selected, inspected.doc);
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
    if (confirm(messages.cancelConfirm(creditsSpent))) {
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
    setLoadedFileName('');
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
    loadedFileName,
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
    runtimeMinutes,
    uploadCredits,
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
