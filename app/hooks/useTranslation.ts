'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseFilename, type FilenameMetadata } from '../utils/metadataInference';
import { requestChunkTranslation } from '../lib/client/translationApi';
import { translateChunkWithRetry, type RetryState } from '../lib/client/chunkRetry';
import {
  beginTranslationJob,
  JobRefusedError,
} from '../lib/client/translationJob';
import { saveResult } from '../lib/client/history';
import { sendRunMetrics } from '../lib/client/metrics';
import {
  adjustSubtitleTiming,
  buildOutputFilename,
  chunkSrtBlocksAtGaps,
  enforceTextRules,
  parseSrtBlocks,
  readBlockIndex,
} from '../lib/srt';
import {
  emitInOriginalFormat,
  formatExtension,
  subtitleMime,
  type SubtitleDoc,
} from '../lib/subtitles';
import {
  computeSweepBudget,
  countTranslatableLeftovers,
  runRecoverySweep,
} from '../lib/client/recoverySweep';
import { runOrderedPool } from '../lib/client/concurrency';
import { computeRetryBudget } from '../lib/translationErrors';
import type {
  DownloadOption,
  MovieInfo,
  TranslationStyle,
  TranslationProgress,
  TranslationResult,
} from '../types/translation';
import type { CastSheet } from '../types/glossary';
import {
  chunkSizeForModel,
  getReadingSpeed,
  getTierLimits,
  MIN_SUBTITLE_DURATION_MS,
  MIN_SUBTITLE_GAP_MS,
  MIN_VERIFY_MS,
  resolveTier,
  type AllowedModel,
} from '../config/constants';
import {
  resolveTargetLang,
  type ContentProfileKey,
} from '../config/languages';
import { estimateRunMsFromChunks } from '../lib/progressEstimate';

interface TranslationState {
  isTranslating: boolean;
  error: string;
}

export type { TranslationProgress } from '../types/translation';

interface AnalysisState {
  isAnalyzing: boolean;
  completed: boolean;
}

/**
 * Every user-facing string this hook can produce. Passed in rather than
 * imported from COPY so the hook stays locale-agnostic — and required, not
 * optional, because an English default here would silently surface in the
 * Korean UI (which is exactly what it used to do).
 */
export interface TranslationMessages {
  serverError: (status: number) => string;
  noResponse: string;
  emptyFile: string;
  generalError: string;
}

const EMPTY_ANALYSIS = { title: '', year: '' };

interface AnalysisOutcome {
  title: string;
  year: string;
  /** Raw server error, when the call failed. Empty on success. */
  error?: string;
}

// Title/year inference from the filename only. If nothing is found the info
// screen drops into manual input — we intentionally don't sample subtitle
// text (unreliable, and an extra AI call) to guess a title.
//
// A failure here still falls back to manual input, but we carry the server's
// error up: an invalid API key used to look identical to "title not found",
// which sent people hunting for a bad filename instead of a bad key.
async function analyzeContent(
  filenameHint: string,
  msg: TranslationMessages,
): Promise<AnalysisOutcome> {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenameHint, content: '' }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return {
        ...EMPTY_ANALYSIS,
        error:
          (body && typeof body.error === 'string' && body.error) ||
          msg.serverError(response.status),
      };
    }
    return await response.json();
  } catch (error) {
    return {
      ...EMPTY_ANALYSIS,
      error: error instanceof Error ? error.message : msg.generalError,
    };
  }
}

/**
 * The renderings offered on the completion screen. SRT is always available
 * because it is what the pipeline produces; the uploaded format is added when
 * its document can be rebuilt. A writer that throws must not cost the user a
 * finished translation, so it degrades to the SRT-only list.
 */
function buildDownloads(
  doc: SubtitleDoc | null,
  originalName: string,
  targetLang: string,
  translatedSrt: string,
): DownloadOption[] {
  const asSrt: DownloadOption = {
    extension: 'srt',
    filename: buildOutputFilename(originalName, targetLang, 'srt'),
    content: translatedSrt,
    mime: subtitleMime('srt'),
  };
  if (!doc || doc.format === 'srt' || !doc.roundTrip) return [asSrt];

  try {
    const extension = formatExtension(doc.format);
    return [
      {
        extension,
        filename: buildOutputFilename(originalName, targetLang, extension),
        content: emitInOriginalFormat(doc, translatedSrt),
        mime: subtitleMime(doc.format),
      },
      asSrt,
    ];
  } catch (err) {
    console.error('[translate] round-trip failed, offering SRT only', err);
    return [asSrt];
  }
}

/**
 * `ms`만큼 기다리되, 사용자가 취소하면 즉시 깨어난다. 검증 단계 최소 노출이
 * 취소를 삼키면 안 되기 때문에 필요하다.
 */
function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

const IDLE_PROGRESS: TranslationProgress = {
  stage: 'idle',
  currentChunk: 0,
  totalChunks: 0,
  estimatedRemainingMs: 0,
  lastUpdateTimestamp: 0,
  totalEstimateMs: 0,
  sweepRecovered: 0,
  sweepRemaining: 0,
};

export function useTranslation(
  msg: TranslationMessages,
  onMetaUpdate?: (meta: FilenameMetadata) => void,
) {
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [state, setState] = useState<TranslationState>({
    isTranslating: false,
    error: '',
  });
  const [analysis, setAnalysis] = useState<AnalysisState>({
    isAnalyzing: false,
    completed: false,
  });
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress>(IDLE_PROGRESS);
  const [result, setResult] = useState<TranslationResult | null>(null);
  /** Set when the server declined to open a job (out of credits, file too big). */
  const [refusal, setRefusal] = useState<JobRefusedError | null>(null);
  /** The currently (or most recently) opened job's id, exposed so the
   *  completion screen and history can both refer to the same run. */
  const [jobId, setJobId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Parsed source document, kept for round-trip output at download time. */
  const docRef = useRef<SubtitleDoc | null>(null);
  const processFileIdRef = useRef(0);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledReset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelScheduledReset, [cancelScheduledReset]);

  // On file upload: parse filename + adopt the parsed document + analyze in
  // background. Reading and parsing happen in the caller, which owns the
  // upload screen and can keep a bad file there instead of advancing a step.
  const processFile = useCallback(async (selectedFile: File, doc: SubtitleDoc) => {
    cancelScheduledReset();
    const fileId = ++processFileIdRef.current;

    setFile(selectedFile);
    docRef.current = doc;
    setFileContent(doc.srt);
    setState((prev) => ({ ...prev, error: '' }));
    setTranslationProgress(IDLE_PROGRESS);
    setResult(null);

    // 1. Immediate: parse filename metadata
    const meta = parseFilename(selectedFile.name);
    onMetaUpdate?.(meta);

    // 2. Background: infer title/year from the filename.
    setAnalysis({ isAnalyzing: true, completed: false });
    const result = await analyzeContent(selectedFile.name, msg);
    if (processFileIdRef.current !== fileId) return;

    if (result.error) {
      setState((prev) => ({ ...prev, error: result.error as string }));
    }

    const updatedMeta: FilenameMetadata = {
      ...meta,
      ...(result.title ? { inferredTitle: result.title } : {}),
      ...(result.year ? { inferredYear: result.year } : {}),
    };
    onMetaUpdate?.(updatedMeta);
    setAnalysis({ isAnalyzing: false, completed: true });
    return result;
  }, [cancelScheduledReset, msg, onMetaUpdate]);

  const translate = async (
    movieInfo: MovieInfo,
    model: string,
    targetLang: string,
    translationStyle: TranslationStyle,
    onSuccess?: () => void,
    castSheet?: CastSheet,
    // Only the timing pass uses this — the profile decides how long a finished
    // line stays on screen, and nothing in the prompt depends on it, so it is
    // never sent to the server (docs/decisions.md §1-19).
    contentProfile?: ContentProfileKey,
  ): Promise<boolean> => {
    if (!file) return false;

    setState({ isTranslating: true, error: '' });
    setResult(null);
    setRefusal(null);
    const startedAt = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const content = docRef.current?.srt || fileContent;
      const blocks = parseSrtBlocks(content);

      if (blocks.length === 0) {
        throw new Error(msg.emptyFile);
      }

      // Spend the credit before any chunk goes out. Doing it here — once per
      // file rather than once per chunk — is what makes a credit worth one
      // title, and it means a refusal costs nothing.
      const newJobId = await beginTranslationJob(blocks.length, model as AllowedModel);
      setJobId(newJobId);

      // Concurrency comes from the tier, which is the one place the
      // billing/session gate will hook into. Chunk size is model-specific
      // instead (docs/decisions.md §2-15) — Pro tunes B for thinking-token
      // cost, flash for renumbering-drift safety, and they don't share a
      // sensible value.
      const { concurrency } = getTierLimits(resolveTier());
      const chunkSize = chunkSizeForModel(model);
      // Cut at scene breaks (large inter-subtitle gaps) near the target size
      // rather than at a fixed block count — same cost, but boundaries land
      // between scenes instead of mid-conversation.
      const chunks = chunkSrtBlocksAtGaps(blocks, chunkSize);
      const totalChunks = chunks.length;
      // 파일 크기를 반영한 추정. 청크 수는 chunkSrtBlocksAtGaps()가 방금
      // 확정했으므로 블록 근사가 아니라 실제 개수를 쓴다.
      // (docs/tuning/chunk-size-model.md §1·§2 → app/lib/progressEstimate.ts)
      const totalEstimateMs = estimateRunMsFromChunks(
        totalChunks,
        chunkSize,
        model,
      );
      const translateStartedAt = Date.now();

      setTranslationProgress({
        stage: 'translating',
        currentChunk: 0,
        totalChunks,
        estimatedRemainingMs: totalEstimateMs,
        lastUpdateTimestamp: Date.now(),
        totalEstimateMs,
        sweepRecovered: 0,
        sweepRemaining: 0,
      });

      // A failed chunk keeps its original (untranslated) text so the output
      // file stays complete. Retries are capped by a single per-file budget
      // (docs/decisions.md §2-2) shared across every chunk — a fatal error
      // (quota/auth) trips retryState.fatalCode, and every chunk that hasn't
      // started yet falls straight back to its original text without
      // spending a call. Only user cancellation aborts the whole job.
      //
      // Whatever is still original when the pool drains — a whole failed
      // chunk, or the odd line a successful chunk's output skipped — is
      // collected here by sequence number and handed to the recovery sweep,
      // which repacks them into fresh chunks and asks again. Counting them
      // rather than diffing text is what keeps a line whose translation
      // legitimately equals its source ("OK", "♪") out of the retry set.
      let failedChunks = 0;
      const leftover: number[] = [];
      const retryState: RetryState = {
        budget: computeRetryBudget(totalChunks),
        fatalCode: null,
      };
      const results = await runOrderedPool<string, string>({
        items: chunks,
        concurrency,
        signal: controller.signal,
        worker: async (chunk, index) => {
          try {
            const outcome = await translateChunkWithRetry(
              chunk,
              controller.signal,
              (content, signal) =>
                requestChunkTranslation(
                  {
                    chunk: content,
                    chunkIndex: index + 1,
                    totalChunks,
                    movieInfo,
                    model,
                    targetLang,
                    translationStyle,
                    jobId: newJobId,
                    castSheet,
                  },
                  signal,
                ),
              retryState,
            );
            leftover.push(...outcome.unmatchedIndices);
            return outcome.content;
          } catch (err) {
            // Let cancellation propagate so the pool can abort.
            if (controller.signal.aborted) throw err;
            failedChunks++;
            console.error(
              `[translate] chunk ${index + 1}/${totalChunks} failed, keeping original`,
              err,
            );
            // The whole chunk is original, so every block in it is a leftover.
            for (const raw of parseSrtBlocks(chunk)) {
              const blockIndex = readBlockIndex(raw);
              if (blockIndex !== null) leftover.push(blockIndex);
            }
            return chunk;
          }
        },
        onCompleted: (completed) => {
          // 관측 처리율로 남은 시간을 다시 재고, 모델 예측과 섞는다. 가중치는
          // 한 웨이브(=concurrency)가 착지하면 1이 된다 — 그때부터는 이번 런의
          // 실제 속도가 모델 예측보다 낫다. 웨이브가 하나뿐인 런(Pro)은 보정
          // 기회가 없지만, 거기서는 모델 예측이 이미 정확하다.
          const modelRemaining = totalEstimateMs * (1 - completed / totalChunks);
          const elapsed = Date.now() - translateStartedAt;
          const measuredRemaining =
            completed > 0
              ? (elapsed * (totalChunks - completed)) / completed
              : modelRemaining;
          const w = Math.min(
            1,
            completed / Math.max(1, Math.min(totalChunks, concurrency)),
          );
          setTranslationProgress((prev) => ({
            ...prev,
            currentChunk: completed,
            estimatedRemainingMs:
              (1 - w) * modelRemaining + w * measuredRemaining,
            lastUpdateTimestamp: Date.now(),
          }));
        },
      });

      if (controller.signal.aborted) {
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }
      if (results.some((chunk) => chunk === undefined)) {
        throw new Error(msg.noResponse);
      }

      const mainPassContent = (results as string[]).join('\n\n');

      // Second pass over just the blocks that came back untranslated. A fatal
      // error means the account itself is the problem, so asking again would
      // only fail the same way — the sweep is skipped and the stop reason
      // stands. See app/lib/client/recoverySweep.ts for the cost bounds.
      let sweptContent = mainPassContent;
      let sweepCalls = 0;
      // Same accounting on both paths: only leftovers that actually hold
      // translatable text are the user's problem.
      let remainingBlocks = countTranslatableLeftovers(content, leftover);
      let recoveredBlocks = 0;
      if (leftover.length > 0 && !retryState.fatalCode) {
        setTranslationProgress((prev) => ({
          ...prev,
          stage: 'recovering',
          sweepRecovered: 0,
          sweepRemaining: remainingBlocks,
        }));
        const sweep = await runRecoverySweep({
          sourceContent: content,
          translatedContent: mainPassContent,
          leftover,
          chunkSize,
          concurrency,
          signal: controller.signal,
          budget: computeSweepBudget(totalChunks),
          // The chunk ring is pinned at its ceiling by now, so these counters
          // are the only thing left that can show the sweep making progress.
          onProgress: ({ recovered, remaining }) =>
            setTranslationProgress((prev) => ({
              ...prev,
              sweepRecovered: recovered,
              sweepRemaining: remaining,
            })),
          // Deliberately the bare request, not translateChunkWithRetry: the
          // sweep's own rounds are its retry, and layering the per-chunk
          // budget on top would double-count the same failure.
          translate: (chunkContent, signal) =>
            requestChunkTranslation(
              {
                chunk: chunkContent,
                chunkIndex: 1,
                totalChunks: 1,
                // Measurement label only — every sweep round is 1/1 on the
                // wire, so this is what keeps them apart from a single-chunk
                // file's one and only call.
                phase: 'sweep',
                movieInfo,
                model,
                targetLang,
                translationStyle,
                jobId: newJobId,
                castSheet,
              },
              signal,
            ),
        });
        sweptContent = sweep.content;
        sweepCalls = sweep.calls;
        recoveredBlocks = sweep.recovered;
        // Blocks with nothing to translate (♪, numbers) aren't the user's
        // problem, so they don't go in the warning count.
        remainingBlocks = sweep.remaining.length;
        console.log(
          `[sweep] recovered ${sweep.recovered}, remaining ${sweep.remaining.length}, untranslatable ${sweep.untranslatable.length}, calls ${sweep.calls}, stopped by ${sweep.stoppedBy}`,
        );
      }

      if (controller.signal.aborted) {
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }

      // 검증 표시는 실제 검증 앞에 선다. 예전엔 이 블록이 작업 뒤에 있었고,
      // 바로 다음 줄의 setTranslationProgress({stage:'done'})와 같은 tick에
      // 묶여서 React가 배치해 버렸다 — verify 단계가 한 프레임도 그려지지
      // 않았고, 사용자에겐 타임코드 검증을 건너뛴 것으로 보였다.
      const verifyStartedAt = Date.now();
      setTranslationProgress((prev) => ({
        ...prev,
        stage: 'finalizing',
        currentChunk: totalChunks,
        totalChunks,
        estimatedRemainingMs: 0,
      }));

      // Mechanical text rules (2-line cap, and sentence-final punctuation for
      // the languages whose convention drops it) have exactly one correct
      // output, so code enforces them rather than hoping the model always
      // complies. Runs before timing so any char-count change lands before
      // CPS measures it.
      const { content: ruleEnforced, report: textRuleReport } = enforceTextRules(
        sweptContent,
        { trailingPunctuation: resolveTargetLang(targetLang).trailingPunctuation },
      );
      if (
        textRuleReport.ellipsisNormalized > 0 ||
        textRuleReport.linesMerged > 0 ||
        textRuleReport.trailingPunctuationStripped > 0
      ) {
        console.log('[translate] text rule enforcement', textRuleReport);
      }

      // Code owns the timecodes end-to-end: after reassembly, widen any block
      // that reads too fast (cps > target) or is simply too short (< min
      // duration) into the free gaps its neighbours leave, without ever
      // overlapping them. Applied on the whole in-order file so it also
      // covers chunk-boundary neighbours.
      // Reading speed is per target language (Latin script reads far more
      // characters per second than Hangul or Han) — see getReadingSpeed.
      const translated = adjustSubtitleTiming(
        ruleEnforced,
        {
          ...getReadingSpeed(targetLang, contentProfile),
          minGapMs: MIN_SUBTITLE_GAP_MS,
          minDurationMs: MIN_SUBTITLE_DURATION_MS,
        },
      );
      const downloads = buildDownloads(
        docRef.current,
        file.name,
        targetLang,
        translated,
      );

      // Persist the result for the completion screen — no auto-download,
      // no auto-reset. The user downloads explicitly and can start over.
      setResult({
        content: translated,
        filename: downloads[0].filename,
        downloads,
        lineCount: parseSrtBlocks(translated).length,
        durationMs: Date.now() - startedAt,
        failedChunks,
        totalChunks,
        fallbackBlocks: remainingBlocks,
        recoveredBlocks,
        stopReason: retryState.fatalCode ?? undefined,
      });

      // Fire-and-forget: the user already has the file, and a failed upload
      // costs them the re-download, not the translation. Errors are swallowed
      // inside saveResult. `glossary` records what was actually applied, not
      // whether the toggle was on — castSheet is undefined when the toggle
      // was off or extraction never resolved.
      void saveResult(newJobId, file.name, translated, {
        glossary: Boolean(castSheet),
      });

      // Same fire-and-forget contract as saveResult, and for the same reason.
      // This is the beta's only record of what a run actually cost in time and
      // leftovers — the token side is written server-side, per model call.
      void sendRunMetrics(newJobId, {
        sourceFormat: docRef.current?.format ?? null,
        targetLang,
        totalChunks,
        chunkSize,
        concurrency,
        durationMs: Date.now() - startedAt,
        failedChunks,
        fallbackBlocks: remainingBlocks,
        recoveredBlocks,
        sweepCalls,
        stopReason: retryState.fatalCode ?? null,
        // What was actually applied, not what the toggle said — castSheet is
        // undefined when extraction never resolved (same rule as `glossary`).
        glossaryTerms: castSheet?.terms?.length ?? 0,
        relationPairs: castSheet?.relations?.length ?? 0,
        textRules: textRuleReport,
      });

      // 검증이 눈에 보이도록 최소 시간을 채운다. 고정 대기가 아니라 최소
      // 보장이다. Math.max(1, ...)는 결과가 항상 setTimeout(매크로태스크)을
      // 타게 만든다 — 0 이하를 그대로 넘기면 sleepUnlessAborted가
      // Promise.resolve()(마이크로태스크)로 처리해 버려서, verify 작업이
      // MIN_VERIFY_MS를 넘긴 드문 경우에 finalizing→done이 다시 한 tick에
      // 묶일 수 있었다 — 이 계획이 고친 바로 그 버그가 조용히 되살아나는
      // 경로였다.
      await sleepUnlessAborted(
        Math.max(1, MIN_VERIFY_MS - (Date.now() - verifyStartedAt)),
        controller.signal,
      );
      if (controller.signal.aborted) {
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }

      setTranslationProgress({
        stage: 'done',
        currentChunk: totalChunks,
        totalChunks,
        estimatedRemainingMs: 0,
        lastUpdateTimestamp: 0,
        totalEstimateMs: 0,
        sweepRecovered: recoveredBlocks,
        sweepRemaining: remainingBlocks,
      });

      onSuccess?.();
      return true;
    } catch (err) {
      // Don't show error for abort
      if (err instanceof Error && err.name === 'AbortError') {
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }
      // A refused job means nothing was spent and nothing ran; the screen has
      // a dedicated state for it, so keep the code rather than a raw message.
      if (err instanceof JobRefusedError) {
        setRefusal(err);
        setTranslationProgress(IDLE_PROGRESS);
        return false;
      }
      console.error('[translate] Translation failed:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : msg.generalError,
      }));
      setTranslationProgress(IDLE_PROGRESS);
      return false;
    } finally {
      setState((prev) => ({ ...prev, isTranslating: false }));
      abortControllerRef.current = null;
    }
  };

  const cancelTranslation = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /** Dismisses the refusal wall without discarding the file / work-in-progress
   *  — unlike clearFile, which resets everything back to the upload screen.
   *  Used by the "설정으로 돌아가기" exit on the exhausted-credits screen. */
  const clearRefusal = useCallback(() => {
    setRefusal(null);
  }, []);

  const clearFile = () => {
    cancelScheduledReset();
    processFileIdRef.current++;
    setFile(null);
    docRef.current = null;
    setFileContent('');
    setAnalysis({ isAnalyzing: false, completed: false });
    setState((prev) => ({ ...prev, error: '' }));
    setTranslationProgress(IDLE_PROGRESS);
    setResult(null);
    setRefusal(null);
    setJobId(null);
  };

  return {
    file,
    fileContent,
    ...state,
    analysis,
    translationProgress,
    result,
    refusal,
    jobId,
    // Reading and parsing belong to the caller — it owns the upload screen and
    // the error slot that names the problem, and a file that fails to parse
    // should never leave that screen. This takes the parsed document and
    // starts analyzing it.
    processFile,
    clearFile,
    clearRefusal,
    translate,
    cancelTranslation,
  };
}
