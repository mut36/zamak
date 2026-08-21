'use client';

import { useCallback, useState } from 'react';
import { applySubtitleRules, type PolishSummary } from '../lib/polish';
import { buildDownloads } from '../lib/downloads';
import { parseSrtBlocks } from '../lib/srt';
import { loadSubtitleFile, type SubtitleDoc } from '../lib/subtitles';
import { resolveTargetLang } from '../config/languages';
import { POLISH_MAX_BLOCKS } from '../config/constants';
import { requestLineSplit, PolishRefusedError } from '../lib/client/polishApi';
import type { DownloadOption } from '../types/translation';
import { COPY } from '../i18n/simpleCopy';

/** 이 경로는 이미 한국어인 자막을 다듬는다 — 도착어를 바꾸지 않는다. */
const TARGET_LANG = 'ko';

export type PolishStage = 'idle' | 'working' | 'done' | 'error';

export type { PolishSummary };

/**
 * `/polish`의 상태. 파이프라인 자체는 `applySubtitleRules`(`app/lib/polish.ts`)에
 * 있고 이 훅은 파일 읽기·거절 처리·화면 상태만 맡는다 — `useWizard`가 판단을
 * 순수 함수로 뽑아 둔 것과 같은 이유로, 렌더 없이 검증되어야 할 것들을 밖에 뒀다.
 */
export function usePolish() {
  const [stage, setStage] = useState<PolishStage>('idle');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<PolishSummary | null>(null);
  const [downloads, setDownloads] = useState<DownloadOption[]>([]);

  const reset = useCallback(() => {
    setStage('idle');
    setError('');
    setSummary(null);
    setDownloads([]);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setStage('working');
    setError('');

    // 어떤 포맷이든 정규 SRT로. 파싱 실패는 업로드 화면의 기존 문구를 쓴다.
    let doc: SubtitleDoc;
    try {
      doc = await loadSubtitleFile(file);
    } catch {
      setError(COPY.upload.invalidFile);
      setStage('error');
      return;
    }

    const blockCount = parseSrtBlocks(doc.srt).length;
    if (blockCount === 0) {
      setError(COPY.upload.noBlocks);
      setStage('error');
      return;
    }
    if (blockCount > POLISH_MAX_BLOCKS) {
      setError(COPY.polish.tooLarge);
      setStage('error');
      return;
    }

    try {
      const outcome = await applySubtitleRules(
        doc.srt,
        resolveTargetLang(TARGET_LANG),
        async (subset) => {
          const response = await requestLineSplit(subset, TARGET_LANG);
          return response.content;
        },
      );

      setSummary(outcome.summary);
      setDownloads(
        buildDownloads(doc, file.name, TARGET_LANG, outcome.content),
      );
      setStage('done');
    } catch (err) {
      if (err instanceof PolishRefusedError) {
        setError(
          err.code === 'file_too_large'
            ? COPY.polish.tooLarge
            : COPY.polish.limitReached,
        );
      } else {
        setError(COPY.polish.failed);
      }
      setStage('error');
    }
  }, []);

  return { stage, error, summary, downloads, handleFile, reset };
}
