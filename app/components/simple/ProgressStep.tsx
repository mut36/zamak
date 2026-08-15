'use client';

import { useState } from 'react';
import type { TranslationProgress } from '../../types/translation';
import { StepBreadcrumb } from '../StepBreadcrumb';
import { COPY } from '../../i18n/simpleCopy';
import { GLOSSARY_WAIT_MS, MIN_VERIFY_MS } from '../../config/constants';
import { estimateRunMsFromBlocks } from '../../lib/progressEstimate';
import { useEasedProgress } from '../../hooks/useEasedProgress';
import {
  activeStage,
  bandsForRun,
  overallPercent,
  stageOrderForRun,
  stageViews,
  type StageKey,
  type StageWeights,
} from '../../lib/progressStages';

interface ProgressStepProps {
  progress: TranslationProgress;
  /** Total subtitle blocks in the source (for the "N / total줄" readout). */
  totalLines: number;
  onCancel: () => void;
  /** Work identification (enrich / manual entry) is always settled before
   *  handleTranslate can even be called — see ProgressStep's own usage site
   *  for why this is passed as a constant rather than tracked state. */
  enrichDone: boolean;
  /** Whether the cast-sheet (glossary) toggle is on for this run. */
  glossaryEnabled: boolean;
  /** False only while the cast-sheet extraction is still in flight. */
  glossaryDone: boolean;
  /** 이 런의 모델. 밴드 폭과 남은 시간 추정에 쓴다 — totalEstimateMs가
   *  첫 청크 요청 전까지 0이라 그것만으로는 Pro/flash를 구분할 수 없다. */
  model: string;
}

const c = COPY.progress;

/** enrich에는 대기 상수가 없다 — 이징이 기댈 수 있는 최소한의 값. */
const CONTEXT_EXPECTED_MS = 3_000;
/** 스윕 소요의 대략적 상한 — 실측치가 아니라 "완료로 보이지 않게" 잡은 값.
 *  recoverySweep의 실제 예산은 콜 수 기반(RECOVERY.BUDGET_RATIO)이라 ms
 *  환산 실측이 없다. */
const RECOVERY_EXPECTED_MS = 15_000;

/**
 * Flat progress bar + stage checklist (context → [glossary] → translate →
 * verify).
 *
 * 바가 그리는 값은 `max(floor를 향한 캐치업, 밴드 끝을 향한 이징)`이다
 * (`useEasedProgress`). 실제 진행만 쓰면 계단으로 튀고 — Pro는 한 웨이브라
 * 142초 동안 아예 멈춰 있다 — 시간만 쓰면 거짓말이 된다.
 *
 * 안 도는 단계(예: 글로사리 OFF)는 목록에서 사라지고 그 폭을 도는 단계가
 * 흡수한다 (`bandsForRun`).
 */
export function ProgressStep({
  progress,
  totalLines,
  onCancel,
  enrichDone,
  glossaryEnabled,
  glossaryDone,
  model,
}: ProgressStepProps) {
  // 밴드는 런 시작에 한 번 계산하고 **얼린다.** estimatedRemainingMs는 실측
  // 보정으로 계속 바뀌는데, 밴드가 그때마다 움직이면 이미 지난 구간의 경계가
  // 이동해 바가 뒤로 간다. useState의 lazy initializer는 첫 렌더에만 실행되니
  // 이 얼림에 딱 맞는다 — ref의 렌더 중 읽기(react-hooks/refs)를 피하면서도
  // 같은 효과를 낸다.
  //
  // translate weight를 totalEstimateMs가 아니라 estimateRunMsFromBlocks로
  // 잡는 것도 같은 이유다 — totalEstimateMs는 첫 청크 요청 전까지 0이고
  // (useTranslation.ts에서 설정된다), 글로사리 대기가 걸리면 최대
  // GLOSSARY_WAIT_MS 동안 0이다. 그 사이에 얼리면 Pro 런이 flash 폭을 갖는다.
  const [frozen] = useState<{
    bands: Record<StageKey, [number, number]>;
    order: StageKey[];
  }>(() => {
    const weights: StageWeights = {
      context: enrichDone ? 0 : CONTEXT_EXPECTED_MS,
      glossary: glossaryEnabled && !glossaryDone ? GLOSSARY_WAIT_MS : 0,
      translate: estimateRunMsFromBlocks(Math.max(1, totalLines), model),
      verify: MIN_VERIFY_MS,
    };
    return {
      bands: bandsForRun(weights),
      order: stageOrderForRun(weights),
    };
  });
  const { bands, order } = frozen;

  const floor = overallPercent(progress, {
    enrichDone,
    glossaryEnabled,
    glossaryDone,
    bands,
  });
  const stage = activeStage(floor, bands, order);

  // 스윕은 청크 콜 수 기준 예산이라(recoverySweep.ts) ms 실측이 없다. 2초용
  // MIN_VERIFY_MS로 그대로 이징하면 몇 초 만에 밴드 끝에 닿고 나머지 스윕
  // 시간(수십 초까지 갈 수 있다) 내내 완료처럼 멈춰 있는다. 그래서 스윕 중엔
  // 천장을 밴드 끝 밑으로 낮추고, 더 긴(추정치일 뿐 실측 아님) 예상 시간을
  // 쓴다. verify 폭이 최소 5%p라(progressStages.ts) 이 2%p는 항상 밴드 안이다.
  const isRecovering = progress.stage === 'recovering';
  const bandEnd = isRecovering ? bands.verify[1] - 2 : bands[stage][1];

  // 밴드마다 이징이 기댈 시간이 다르다. translate는 실측 보정을 거친
  // estimatedRemainingMs(useTranslation), 나머지는 그 단계의 대기 상수.
  const blockEstimateMs = estimateRunMsFromBlocks(
    Math.max(1, totalLines),
    model,
  );
  const expectedMs: Record<StageKey, number> = {
    context: CONTEXT_EXPECTED_MS,
    glossary: GLOSSARY_WAIT_MS,
    translate:
      progress.estimatedRemainingMs ||
      progress.totalEstimateMs ||
      blockEstimateMs,
    verify: isRecovering ? RECOVERY_EXPECTED_MS : MIN_VERIFY_MS,
  };

  const percent = useEasedProgress({
    floor,
    bandEnd,
    expectedMs: expectedMs[stage],
    snap: progress.stage === 'done',
  });

  const views = stageViews(percent, bands, order);
  const title = c.stages[stage];

  // percent는 실제 착지분과의 max이므로 절대 뒤로 가지 않고, totalEstimateMs는
  // 이 런의 총 추정치로 finalizing/recovering 내내 고정이다(done에서만 0으로
  // 리셋되는데 그땐 percent가 이미 100이라 무관) — 그래서 이 곱은 단조 감소만
  // 한다. estimatedRemainingMs를 직접 읽으면 0으로 떨어졌다가(청크 착지 시점,
  // finalizing 진입 시점) totalEstimateMs로 되튀는 순간이 있어 숫자가 거꾸로
  //간다 — 그 버그를 피하려고 일부러 안 쓴다.
  const totalMs = progress.totalEstimateMs || blockEstimateMs;
  const remainingSec =
    percent >= 100
      ? 0
      : Math.max(1, Math.round((totalMs * (1 - percent / 100)) / 1000));
  // 이징된 percent가 아니라 실제 청크 착지 비율로 낸다 — 시간으로 채워진 바
  // 위치는 "크롤일 뿐 거짓말은 아니다"로 정당화되지만, 구체적인 줄 수는
  // 반증 가능한 주장이라 실제로 돌아온 청크만큼만 말해야 한다.
  const processedLines =
    progress.totalChunks > 0
      ? Math.round((progress.currentChunk / progress.totalChunks) * totalLines)
      : 0;

  return (
    <div className='animate-zslide flex flex-col items-center w-full max-w-[520px] mx-auto'>
      <StepBreadcrumb current='translate' className='mb-6' />
      <div className='head text-center'>
        <h1 className='!text-h1-mini'>{title}</h1>
      </div>

      <div className='mono text-fineprint text-tertiary mt-1'>
        {c.pct(percent, remainingSec)}
      </div>

      <div className='w-full h-[6px] rounded-full bg-track overflow-hidden mt-4 mb-4'>
        {/* rAF가 매 프레임 값을 주므로 CSS 트랜지션을 걸지 않는다 — 이중 이징이
            되면 바가 늘어지고 실제 착지 반영이 늦어진다. */}
        <div
          className='h-full rounded-full bg-ink-strong'
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      <div className='card flex flex-col gap-[14px] w-full p-[24px_28px]'>
        {views.map((view) => (
          <div
            key={view.key}
            className={`flex items-center gap-3${
              view.state === 'pending' ? ' opacity-40' : ''
            }`}
          >
            {view.state === 'done' ? (
              <span
                className='flex items-center justify-center w-5 h-5 rounded-full text-white text-mono-step font-bold shrink-0'
                style={{ background: 'var(--success)' }}
              >
                ✓
              </span>
            ) : (
              <span
                className={`w-5 h-5 rounded-full shrink-0${
                  view.state === 'active' ? ' animate-zbreathe' : ''
                }`}
                style={{
                  background:
                    view.state === 'active' ? 'var(--ink-strong)' : 'transparent',
                  border:
                    view.state === 'active'
                      ? 'none'
                      : '1.5px solid var(--border-step)',
                }}
              />
            )}
            <span className='text-body text-nav'>{c.stages[view.key]}</span>
          </div>
        ))}
      </div>

      {/* While the sweep runs, the checklist is already pinned on "verify" —
          swap the readout for the one pair of numbers that is still moving,
          so the extra wait doesn't look like a hang. */}
      {progress.stage === 'recovering' ? (
        <div className='psub mono mt-4'>
          {c.recoveringDetail(progress.sweepRecovered, progress.sweepRemaining)}
        </div>
      ) : (
        totalLines > 0 && (
          <div className='psub mono mt-4'>
            {c.remaining(processedLines, totalLines, remainingSec)}
          </div>
        )
      )}

      <p className='text-caption text-nav text-center mt-6'>{c.reassure}</p>

      <button type='button' className='btn btn-ghost mt-5' onClick={onCancel}>
        {c.cancel}
      </button>
    </div>
  );
}
