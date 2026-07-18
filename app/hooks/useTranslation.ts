'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseFilename, type FilenameMetadata } from '../utils/metadataInference';
import {
  requestChunkTranslation,
  type TranslationApiKeys,
} from '../lib/client/translationApi';
import {
  buildOutputFilename,
  chunkSrtBlocks,
  parseSrtBlocks,
} from '../lib/srt';
import { runOrderedPool } from '../lib/client/concurrency';
import type {
  MovieInfo,
  TranslationStyle,
  TranslationProgress,
  TranslationResult,
} from '../types/translation';
import { CHUNK_SIZE, CONCURRENCY, TIMING } from '../config/constants';

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

// Title/year inference from the filename only. If nothing is found the info
// screen drops into manual input — we intentionally don't sample subtitle
// text (unreliable, and an extra AI call) to guess a title.
async function analyzeContent(
  filenameHint: string,
  apiKey?: string,
): Promise<{ title: string; year: string }> {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-gemini-key': apiKey } : {}),
      },
      body: JSON.stringify({ filenameHint, content: '' }),
    });
    if (!response.ok) return EMPTY_ANALYSIS;
    return await response.json();
  } catch {
    return EMPTY_ANALYSIS;
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
  const processFile = useCallback(async (selectedFile: File, apiKey?: string) => {
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
    const result = await analyzeContent(selectedFile.name, apiKey);
    if (processFileIdRef.current !== fileId) return;

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
    (droppedFile: File, apiKey?: string) => {
      if (isSrtFile(droppedFile)) {
        processFile(droppedFile, apiKey);
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
    apiKeys?: TranslationApiKeys,
  ): Promise<boolean> => {
    if (!file) return false;

    setState({ isTranslating: true, error: '' });
    setResult(null);
    const startedAt = Date.now();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const content = fileContent || (await file.text());
      const blocks = parseSrtBlocks(content);

      if (blocks.length === 0) {
        throw new Error(msg.emptyFile);
      }

      // Split into chunks of CHUNK_SIZE blocks and translate them with up to
      // CONCURRENCY parallel requests. A very large CHUNK_SIZE yields a single
      // chunk (no parallelism) — the knob for testing parallel translation.
      const chunks = chunkSrtBlocks(blocks, CHUNK_SIZE);
      const totalChunks = chunks.length;
      // Rough estimate: number of concurrency "waves" × per-chunk time.
      const waves = Math.max(1, Math.ceil(totalChunks / CONCURRENCY));
      const totalEstimateMs = waves * TIMING.FLASH_BATCH_MS;

      setTranslationProgress({
        stage: 'translating',
        currentChunk: 0,
        totalChunks,
        estimatedRemainingMs: totalEstimateMs,
        lastUpdateTimestamp: Date.now(),
        totalEstimateMs,
      });

      // A failed chunk keeps its original (untranslated) text so the output
      // file stays complete. We never retry here — one call per chunk — and
      // only cancellation aborts the whole job.
      let failedChunks = 0;
      const results = await runOrderedPool<string, string>({
        items: chunks,
        concurrency: CONCURRENCY,
        signal: controller.signal,
        worker: async (chunk, index) => {
          try {
            return await requestChunkTranslation(
              {
                chunk,
                chunkIndex: index + 1,
                totalChunks,
                movieInfo,
                model,
                targetLang,
                translationStyle,
              },
              controller.signal,
              apiKeys,
            );
          } catch (err) {
            // Let cancellation propagate so the pool can abort.
            if (
              controller.signal.aborted ||
              (err instanceof Error && err.name === 'AbortError')
            ) {
              throw err;
            }
            failedChunks++;
            console.error(
              `[translate] chunk ${index + 1}/${totalChunks} failed, keeping original`,
              err,
            );
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

      const translated = (results as string[]).join('\n\n');
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
  };

  return {
    file,
    fileContent,
    ...state,
    analysis,
    translationProgress,
    result,
    handleFileChange,
    handleFileDrop,
    clearFile,
    translate,
    cancelTranslation,
  };
}
