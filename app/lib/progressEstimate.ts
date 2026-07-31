import {
  chunkSizeForModel,
  FLASH_MODEL,
  PRO_MODEL,
  SERVER_CONCURRENCY,
} from '../config/constants';

/**
 * 진행 바가 채워질 벽시계 시간의 추정.
 *
 * `docs/tuning/chunk-size-model.md` §1(실측 파라미터)·§2(공식)를 코드로 옮긴 것이다.
 * 그 유도는 지금까지 문서에만 있었고 런타임은 모델별 상수 하나
 * (`TRANSLATION_ESTIMATE_MS`)만 알고 있었다 — 그래서 파일 크기와 무관하게 같은
 * 시간을 약속했다.
 *
 *   D(model, B) = TTFT + B·(t_out + θ) / v      청크 하나
 *   T           = ⌈m/K⌉ · D + OVERHEAD          전체
 *
 * θ(블록당 thinking 토큰)가 flash에서는 0이고 Pro에서는 40이라는 게 두 모델의
 * 구조적 차이다 — Pro 청크 소요의 기울기가 3.5배가 된다.
 *
 * ⚠️ 이 표를 고치면 설정 화면의 "약 N초" 약속과 진행 바가 함께 움직인다.
 */
interface ModelTiming {
  /** 출력 생성 속도 (tok/s). */
  v: number;
  /** 블록당 출력 토큰. */
  tOut: number;
  /** 블록당 thinking 토큰. flash는 0(MINIMAL·LOW 모두), Pro HIGH는 ~40. */
  theta: number;
}

const TIMING: Record<string, ModelTiming> = {
  // chunk-size-model.md §1 실측표 (2026-07-21).
  [FLASH_MODEL]: { v: 220, tOut: 16, theta: 0 },
  // 동 §1 Pro 실측표 (2026-07-28, 14런). v는 95~137 범위의 보수값.
  // θ=40은 2026-07-31 장편 런에서 44.0으로 재확인됐다.
  [PRO_MODEL]: { v: 100, tOut: 16, theta: 40 },
};

/** 첫 토큰까지 지연. chunk-size-model.md §1에서 추정치로 표기된 값. */
const TTFT_MS = 2_000;

/**
 * 청크 웨이브 밖의 고정 비용 — 재조립, 텍스트 규칙 강제, 리딩스피드 보정.
 * flash 실측 잔차에서 뽑았다. 회수 스윕은 조건부라 여기 넣지 않는다 — 스윕
 * 구간은 진행 바에서 verify 밴드가 따로 담당한다.
 */
const OVERHEAD_MS = 3_000;

function timingFor(model: string): ModelTiming {
  return TIMING[model] ?? TIMING[FLASH_MODEL];
}

/** 청크 하나가 걸리는 시간. */
export function estimateChunkMs(model: string, chunkSize: number): number {
  const { v, tOut, theta } = timingFor(model);
  return TTFT_MS + (Math.max(1, chunkSize) * (tOut + theta) * 1000) / v;
}

/**
 * 청크 수가 확정된 뒤의 추정 — 번역이 시작되면 `chunkSrtBlocksAtGaps()`가
 * 실제 개수를 알려주므로 근사를 쓸 이유가 없다.
 */
export function estimateRunMsFromChunks(
  totalChunks: number,
  chunkSize: number,
  model: string,
): number {
  const chunks = Math.max(1, Math.ceil(totalChunks));
  const waves = Math.ceil(chunks / SERVER_CONCURRENCY);
  return waves * estimateChunkMs(model, chunkSize) + OVERHEAD_MS;
}

/**
 * 청크 수를 아직 모를 때의 추정 (설정 화면). 장면 경계에서 자르는
 * `chunkSrtBlocksAtGaps()` 때문에 실제 청크 수는 ⌈N/B⌉와 다를 수 있다.
 */
export function estimateRunMsFromBlocks(blocks: number, model: string): number {
  const chunkSize = chunkSizeForModel(model);
  const m = Math.ceil(Math.max(1, blocks) / chunkSize);
  return estimateRunMsFromChunks(m, chunkSize, model);
}
