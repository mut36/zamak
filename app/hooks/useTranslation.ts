'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseFilename, type FilenameMetadata } from '../utils/metadataInference';
import { requestChunkTranslation } from '../lib/client/translationApi';
import { translateChunkWithRetry, type RetryState } from '../lib/client/chunkRetry';
import {
  beginTranslationJob,
  JobRefusedError,
} from '../lib/client/translationJob';
import {
  adjustSubtitleTiming,
  buildOutputFilename,
  chunkSrtBlocksAtGaps,
  enforceTextRules,
  parseSrtBlocks,
  readBlockIndex,
} from '../lib/srt';
import {
  computeSweepBudget,
  runRecoverySweep,
} from '../lib/client/recoverySweep';
import { runOrderedPool } from '../lib/client/concurrency';
import { computeRetryBudget } from '../lib/translationErrors';
import type {
  MovieInfo,
  TranslationStyle,
  TranslationProgress,
  TranslationResult,
} from '../types/translation';
import type { CastSheet } from '../types/glossary';
import {
  estimateTranslationMs,
  getReadingSpeed,
  getTierLimits,
  MIN_SUBTITLE_DURATION_MS,
  MIN_SUBTITLE_GAP_MS,
  resolveTier,
} from '../config/constants';
import { resolveTargetLang } from '../config/languages';

interface TranslationState {
  isTranslating: boolean;
  error: string;
}

export type { TranslationProgress } from '../types/translation';

interface AnalysisState {
  isAnalyzing: boolean;
  completed: boolean;
}

export interface TranslationMessages {
  serverError: (status: number) => string;
  noResponse: string;
  invalidFile: string;
  emptyFile: string;
  generalError: string;
}

function isSrtFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.srt');
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
async function analyzeContent(filenameHint: string): Promise<AnalysisOutcome> {
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
          `Server error (${response.status})`,
      };
    }
    return await response.json();
  } catch (error) {
    return {
      ...EMPTY_ANALYSIS,
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

const IDLE_PROGRESS: TranslationProgress = {
  stage: 'idle',
  currentChunk: 0,
  totalChunks: 0,
  estimatedRemainingMs: 0,
  lastUpdateTimestamp: 0,
  totalEstimateMs: 0,
};

export function useTranslation(
  onMetaUpdate?: (meta: FilenameMetadata) => void,
  messages?: TranslationMessages,
) {
  const msg: TranslationMessages = messages ?? {
    serverError: (status: number) => `Server error (${status})`,
    noResponse: 'No translation response received',
    invalidFile: 'Please select a valid SRT file',
    emptyFile: 'No valid subtitle blocks in SRT file',
    generalError: 'An error occurred',
  };
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const processFileIdRef = useRef(0);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelScheduledReset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelScheduledReset, [cancelScheduledReset]);

  // On file upload: parse filename + read content + analyze genre/tone in background
  const processFile = useCallback(async (selectedFile: File) => {
    cancelScheduledReset();
    const fileId = ++processFileIdRef.current;

    setFile(selectedFile);
    setState((prev) => ({ ...prev, error: '' }));
    setTranslationProgress(IDLE_PROGRESS);
    setResult(null);

    // 1. Immediate: parse filename metadata
    const meta = parseFilename(selectedFile.name);
    onMetaUpdate?.(meta);

    // 2. Read file content
    const content = await selectedFile.text();
    if (processFileIdRef.current !== fileId) return;
    setFileContent(content);

    // 3. Background: infer title/year from the filename.
    setAnalysis({ isAnalyzing: true, completed: false });
    const result = await analyzeContent(selectedFile.name);
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
  }, [cancelScheduledReset, onMetaUpdate]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        if (isSrtFile(selectedFile)) {
          processFile(selectedFile);
        } else {
          setState((prev) => ({ ...prev, error: msg.invalidFile }));
          setFile(null);
        }
      }
    },
    [msg.invalidFile, processFile],
  );

  const handleFileDrop = useCallback(
    (droppedFile: File) => {
      if (isSrtFile(droppedFile)) {
        // Returned so the caller can react to an analysis failure.
        return processFile(droppedFile);
      } else {
        setState((prev) => ({ ...prev, error: msg.invalidFile }));
        setFile(null);
      }
    },
    [msg.invalidFile, processFile],
  );

  const translate = async (
    movieInfo: MovieInfo,
    model: string,
    targetLang: string,
    translationStyle: TranslationStyle,
    onSuccess?: () => void,
    castSheet?: CastSheet,
  ): Promise<boolean> => {
    if (!file) return false;

    setState({ isTranslating: true, error: '' });
    setResult(null);
    setRefusal(null);
    const startedAt = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const content = fileContent || (await file.text());
      const blocks = parseSrtBlocks(content);

      if (blocks.length === 0) {
        throw new Error(msg.emptyFile);
      }

      // Spend the credit before any chunk goes out. Doing it here — once per
      // file rather than once per chunk — is what makes a credit worth one
      // title, and it means a refusal costs nothing.
      const jobId = await beginTranslationJob(blocks.length);

      // Chunk size and concurrency both come from the tier, which is the one
      // place the billing/session gate will hook into.
      const { chunkSize, concurrency } = getTierLimits(resolveTier());
      // Cut at scene breaks (large inter-subtitle gaps) near the target size
      // rather than at a fixed block count — same cost, but boundaries land
      // between scenes instead of mid-conversation.
      const chunks = chunkSrtBlocksAtGaps(blocks, chunkSize);
      const totalChunks = chunks.length;
      // One figure per model — the same one the landing copy promises.
      const totalEstimateMs = estimateTranslationMs(model);

      setTranslationProgress({
        stage: 'translating',
        currentChunk: 0,
        totalChunks,
        estimatedRemainingMs: totalEstimateMs,
        lastUpdateTimestamp: Date.now(),
        totalEstimateMs,
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
                    jobId,
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
          setTranslationProgress((prev) => ({
            ...prev,
            currentChunk: completed,
            estimatedRemainingMs:
              totalEstimateMs * (1 - completed / totalChunks),
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
      let remainingBlocks = leftover.length;
      let recoveredBlocks = 0;
      if (leftover.length > 0 && !retryState.fatalCode) {
        setTranslationProgress((prev) => ({ ...prev, stage: 'recovering' }));
        const sweep = await runRecoverySweep({
          sourceContent: content,
          translatedContent: mainPassContent,
          leftover,
          chunkSize,
          concurrency,
          signal: controller.signal,
          budget: computeSweepBudget(totalChunks),
          // Deliberately the bare request, not translateChunkWithRetry: the
          // sweep's own rounds are its retry, and layering the per-chunk
          // budget on top would double-count the same failure.
          translate: (chunkContent, signal) =>
            requestChunkTranslation(
              {
                chunk: chunkContent,
                chunkIndex: 1,
                totalChunks: 1,
                movieInfo,
                model,
                targetLang,
                translationStyle,
                jobId,
                castSheet,
              },
              signal,
            ),
        });
        sweptContent = sweep.content;
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
          ...getReadingSpeed(targetLang),
          minGapMs: MIN_SUBTITLE_GAP_MS,
          minDurationMs: MIN_SUBTITLE_DURATION_MS,
        },
      );
      const outputFilename = buildOutputFilename(file.name, targetLang);

      setTranslationProgress({
        stage: 'finalizing',
        currentChunk: totalChunks,
        totalChunks,
        estimatedRemainingMs: 0,
        lastUpdateTimestamp: 0,
        totalEstimateMs: 0,
      });

      // Persist the result for the completion screen — no auto-download,
      // no auto-reset. The user downloads explicitly and can start over.
      setResult({
        content: translated,
        filename: outputFilename,
        lineCount: parseSrtBlocks(translated).length,
        durationMs: Date.now() - startedAt,
        failedChunks,
        totalChunks,
        fallbackBlocks: remainingBlocks,
        recoveredBlocks,
        stopReason: retryState.fatalCode ?? undefined,
      });

      setTranslationProgress({
        stage: 'done',
        currentChunk: totalChunks,
        totalChunks,
        estimatedRemainingMs: 0,
        lastUpdateTimestamp: 0,
        totalEstimateMs: 0,
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

  const clearFile = () => {
    cancelScheduledReset();
    processFileIdRef.current++;
    setFile(null);
    setFileContent('');
    setAnalysis({ isAnalyzing: false, completed: false });
    setState((prev) => ({ ...prev, error: '' }));
    setTranslationProgress(IDLE_PROGRESS);
    setResult(null);
    setRefusal(null);
  };

  return {
    file,
    fileContent,
    ...state,
    analysis,
    translationProgress,
    result,
    refusal,
    handleFileChange,
    handleFileDrop,
    clearFile,
    translate,
    cancelTranslation,
  };
}
