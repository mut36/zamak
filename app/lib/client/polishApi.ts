import type { DialogueCandidate } from '../mergeDialogue';

export interface PolishResponse {
  content: string;
  totalChunks: number;
  failedChunks: number;
}

/** 서버가 거절했을 때. `code`는 배너 문구를 고르는 데 쓴다. */
export class PolishRefusedError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfter?: number,
  ) {
    super(code);
    this.name = 'PolishRefusedError';
  }
}

/**
 * 초과 줄만 담긴 SRT를 **한 번에** 보낸다.
 *
 * 파일 하나 = 요청 하나인 것이 중요하다: 레이트 리밋이 요청 단위로 세므로,
 * 청크마다 요청을 쪼개면 "하루 5회"가 "하루 파일 한두 개"로 줄어든다. 청크
 * 분할은 서버가 안에서 한다(`polishService`).
 */
export async function requestLineSplit(
  subset: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<PolishResponse> {
  const response = await fetch('/api/polish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subset, targetLang }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new PolishRefusedError(
      typeof body.code === 'string' ? body.code : String(response.status),
      typeof body.retry_after === 'number' ? body.retry_after : undefined,
    );
  }

  return response.json();
}

export interface DialogueMergeResponse {
  /** 합치라고 판정된 후보 번호. */
  approved: number[];
  totalChunks: number;
  failedChunks: number;
}

/**
 * 후보 쌍을 **한 번에** 보내 판정을 받는다. 요청을 하나로 묶는 이유는
 * `requestLineSplit`과 같다 — 레이트 리밋이 요청 단위라 쪼개면 한도가 녹는다.
 *
 * 보내는 것은 후보의 대사 두 줄뿐이다. 타임코드도 자막 번호의 의미도 서버가
 * 몰라도 되는 판정이므로, 자막 파일 전체를 올릴 이유가 없다.
 */
export async function requestDialogueMerge(
  candidates: readonly DialogueCandidate[],
  targetLang: string,
  signal?: AbortSignal,
): Promise<DialogueMergeResponse> {
  const response = await fetch('/api/polish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'merge', candidates, targetLang }),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new PolishRefusedError(
      typeof body.code === 'string' ? body.code : String(response.status),
      typeof body.retry_after === 'number' ? body.retry_after : undefined,
    );
  }

  return response.json();
}
