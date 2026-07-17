'use client';

import { useEffect, useState } from 'react';
import type { TranslationProgress } from '../types/translation';

export function useProgressDisplay(progress: TranslationProgress) {
  const [liveRemainingMs, setLiveRemainingMs] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0);

  useEffect(() => {
    const { stage, estimatedRemainingMs, lastUpdateTimestamp } = progress;

    const updateDisplay = () => {
      if (stage === 'idle') {
        setLiveRemainingMs(0);
        setTargetProgress(0);
        return;
      }
      if (stage === 'done' || stage === 'finalizing') {
        setLiveRemainingMs(0);
        setTargetProgress(100);
        return;
      }
      if (lastUpdateTimestamp === 0 || estimatedRemainingMs <= 0) {
        setLiveRemainingMs(0);
        setTargetProgress(
          progress.totalChunks > 0
            ? (progress.currentChunk / progress.totalChunks) * 100
            : 0,
        );
        return;
      }

      const remaining = Math.max(
        0,
        estimatedRemainingMs - (Date.now() - lastUpdateTimestamp),
      );
      setLiveRemainingMs(remaining);
      setTargetProgress(
        progress.totalChunks > 0
          ? (progress.currentChunk / progress.totalChunks) * 100
          : 0,
      );
    };

    const timeout = window.setTimeout(updateDisplay, 0);
    const interval =
      stage === 'translating' && estimatedRemainingMs > 0
        ? window.setInterval(updateDisplay, 1000)
        : undefined;
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [progress]);

  return {
    liveRemainingMs,
    targetProgress,
    transitionDuration: 1,
  };
}
