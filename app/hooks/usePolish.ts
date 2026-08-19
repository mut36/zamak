'use client';

import { useCallback, useState } from 'react';
import { collectOverLongBlocks, spliceBlocks } from '../lib/polish';
import { buildDownloads } from '../lib/downloads';
import { enforceTextRules, parseSrtBlocks, type TextRuleReport } from '../lib/srt';
import { loadSubtitleFile, type SubtitleDoc } from '../lib/subtitles';
import { resolveTargetLang } from '../config/languages';
import { MAX_BLOCKS_PER_CREDIT } from '../config/constants';
import { requestLineSplit, PolishRefusedError } from '../lib/client/polishApi';
import type { DownloadOption } from '../types/translation';
import { COPY } from '../i18n/simpleCopy';

/** 이 경로는 이미 한국어인 자막을 다듬는다 — 도착어를 바꾸지 않는다. */
const TARGET_LANG = 'ko';

export type PolishStage = 'idle' | 'working' | 'done' | 'error';

export interface PolishSummary extends TextRuleReport {
  /** 상한을 넘었다가 실제로 해소된 블록 수. */
  linesSplit: number;
  /** 상한을 넘었는데 끝내 안 나뉜 블록 수(청크 실패 등). */
  unsplitLines: number;
}

function addReports(a: TextRuleReport, b: TextRuleReport): TextRuleReport {
  return {
    ellipsisNormalized: a.ellipsisNormalized + b.ellipsisNormalized,
    linesMerged: a.linesMerged + b.linesMerged,
    trailingPunctuationStripped:
      a.trailingPunctuationStripped + b.trailingPunctuationStripped,
    linesJoined: a.linesJoined + b.linesJoined,
    midLinePeriodsToCommas: a.midLinePeriodsToCommas + b.midLinePeriodsToCommas,
    speakerLinesSplit: a.speakerLinesSplit + b.speakerLinesSplit,
  };
}

/**
 * `/polish`의 전체 흐름.
 *
 * **타임코드를 건드리는 단계가 하나도 없다** — `adjustSubtitleTiming`을 부르지
 * 않으므로 타임코드는 1번 파싱에서 마지막 다운로드까지 그대로 흐른다. 번역
 * 경로와 다른 점이자, 이 기능이 "규칙만 적용"이라고 말할 수 있는 근거다.
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

    // 1. 어떤 포맷이든 정규 SRT로. 파싱 실패는 업로드 화면의 기존 문구를 쓴다.
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
    if (blockCount > MAX_BLOCKS_PER_CREDIT) {
      setError(COPY.polish.tooLarge);
      setStage('error');
      return;
    }

    try {
      const lang = resolveTargetLang(TARGET_LANG);
      const ruleOptions = {
        trailingPunctuation: lang.trailingPunctuation,
        lineMaxChars: lang.lineMaxChars,
        ellipsis: lang.ellipsis,
      };

      // 2. 1차 규칙 — 코드가 결정적으로 처리하는 전부.
      const first = enforceTextRules(doc.srt, ruleOptions);

      // 3. 상한을 넘는 블록만 고른다.
      const { subset, indices } = collectOverLongBlocks(
        first.content,
        lang.lineMaxChars,
      );

      // 4. 초과가 없으면 모델을 아예 안 부른다 — 비용 0, 즉시 완료.
      //    ZAMAK이 번역한 자막을 다시 넣으면 대개 이 경로다.
      let merged = first.content;
      if (indices.length > 0) {
        const response = await requestLineSplit(subset, TARGET_LANG);
        merged = spliceBlocks(first.content, response.content);
      }

      // 5. 2차 규칙 — AI가 나눈 결과에 2줄 상한·접기·마침표를 다시 적용.
      const second = enforceTextRules(merged, ruleOptions);

      // 남은 초과는 **최종 결과물**에서 센다. 2차 규칙이 마침표를 떼면서 상한
      // 아래로 내려오는 블록이 있어, 병합 직후에 세면 성공을 과소 집계한다.
      const unsplitLines = collectOverLongBlocks(
        second.content,
        lang.lineMaxChars,
      ).indices.length;

      setSummary({
        ...addReports(first.report, second.report),
        // 2차 규칙의 3줄→2줄 병합이 새로 긴 줄을 만들 수 있어서 unsplitLines가
        // 원래 초과 수를 넘길 수 있다. 요약에 음수가 뜨는 것보다 0이 정직하다.
        linesSplit: Math.max(0, indices.length - unsplitLines),
        unsplitLines,
      });
      setDownloads(buildDownloads(doc, file.name, TARGET_LANG, second.content));
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
