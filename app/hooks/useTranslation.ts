'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { parseFilename, type FilenameMetadata } from '../utils/metadataInference';
import { downloadFile } from '../utils/downloadFile';
import {
  requestChunkTranslation,
  type TranslationApiKeys,
} from '../lib/client/translationApi';
import {
  buildOutputFilename,
  parseSrtBlocks,
} from '../lib/srt';
import type {
  MovieInfo,
  TranslationStyle,
  TranslationProgress,
} from '../types/translation';
import {
  ANALYSIS_BLOCKS,
  TIMING,
} from '../config/constants';

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

async function analyzeContent(
  filenameHint: string,
  subtitleSample?: string,
): Promise<{ title: string; year: string }> {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenameHint, content: subtitleSample ?? '' }),
    });
    if (!response.ok) return EMPTY_ANALYSIS;
    return await response.json();
  } catch {
    return EMPTY_ANALYSIS;
  }
}

function isAnalysisSufficient(result: { title: string }): boolean {
  return !!result.title;
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
  siteLang?: string,
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

    // 1. Immediate: parse filename metadata
    const meta = parseFilename(selectedFile.name);
    onMetaUpdate?.(meta);

    // 2. Read file content
    const content = await selectedFile.text();
    if (processFileIdRef.current !== fileId) return;
    setFileContent(content);

    // 3. Background: analyze — filename first, subtitle sample as fallback
    setAnalysis({ isAnalyzing: true, completed: false });

    // Step 1: filename only
    let result = await analyzeContent(selectedFile.name);
    if (processFileIdRef.current !== fileId) return;

    // Step 2: fallback to subtitle sample if title not found
    if (!isAnalysisSufficient(result)) {
      const blocks = parseSrtBlocks(content);
      if (blocks.length > 0) {
        const sample = blocks.slice(0, ANALYSIS_BLOCKS).join('\n\n');
        result = await analyzeContent(selectedFile.name, sample);
        if (processFileIdRef.current !== fileId) return;
      }
    }

    const updatedMeta: FilenameMetadata = {
      ...meta,
      ...(result.title ? { inferredTitle: result.title } : {}),
      ...(result.year ? { inferredYear: result.year } : {}),
    };
    onMetaUpdate?.(updatedMeta);
    setAnalysis({ isAnalyzing: false, completed: true });
    return result;
  }, [cancelScheduledReset, onMetaUpdate, siteLang]);

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
        processFile(droppedFile);
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
  ) => {
    if (!file) return;

    const activeFileId = processFileIdRef.current;
    setState({ isTranslating: true, error: '' });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const content = fileContent || (await file.text());
      const blocks = parseSrtBlocks(content);

      if (blocks.length === 0) {
        throw new Error(msg.emptyFile);
      }

      const fullContent = blocks.join('\n\n');
      const initialEstimateMs = TIMING.PRO_BATCH_MS;

      setTranslationProgress({
        stage: 'translating',
        currentChunk: 0,
        totalChunks: 1,
        estimatedRemainingMs: initialEstimateMs,
        lastUpdateTimestamp: Date.now(),
        totalEstimateMs: initialEstimateMs,
      });

      const result = await requestChunkTranslation(
        {
          chunk: fullContent,
          chunkIndex: 1,
          totalChunks: 1,
          movieInfo,
          model,
          targetLang,
          translationStyle,
        },
        controller.signal,
        apiKeys,
      );

      const outputFilename = buildOutputFilename(file.name, targetLang);

      if (controller.signal.aborted) {
        setTranslationProgress(IDLE_PROGRESS);
        return;
      }

      setTranslationProgress({
        stage: 'finalizing',
        currentChunk: 1,
        totalChunks: 1,
        estimatedRemainingMs: 0,
        lastUpdateTimestamp: 0,
        totalEstimateMs: 0,
      });

      if (!result) throw new Error(msg.noResponse);
      downloadFile(result, outputFilename);

      setTranslationProgress({
        stage: 'done',
        currentChunk: 1,
        totalChunks: 1,
        estimatedRemainingMs: 0,
        lastUpdateTimestamp: 0,
        totalEstimateMs: 0,
      });

      onSuccess?.();
      resetTimeoutRef.current = setTimeout(() => {
        if (processFileIdRef.current !== activeFileId) return;
        setTranslationProgress(IDLE_PROGRESS);
        setFile(null);
        setFileContent('');
        setAnalysis({ isAnalyzing: false, completed: false });
        resetTimeoutRef.current = null;
      }, TIMING.SUCCESS_RESET_MS);
    } catch (err) {
      // Don't show error for abort
      if (err instanceof Error && err.name === 'AbortError') {
        setTranslationProgress(IDLE_PROGRESS);
        return;
      }
      console.error('[translate] Translation failed:', err);
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : msg.generalError,
      }));
      setTranslationProgress(IDLE_PROGRESS);
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
  };

  return {
    file,
    ...state,
    analysis,
    translationProgress,
    handleFileChange,
    handleFileDrop,
    clearFile,
    translate,
    cancelTranslation,
  };
}
