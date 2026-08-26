import 'server-only';

import { geminiProvider } from '../providers/gemini';
import { classifyError } from '../translationErrors';
import { runOrderedPool } from '../client/concurrency';
import {
  FLASH_MODEL,
  POLISH_CHUNK_SIZE,
  SERVER_CONCURRENCY,
} from '../../config/constants';
import type { PolishCallMeasurement } from './polishService';

export interface JudgePoolOptions<Item, Verdict> {
  /** 판정 대상. 순서대로 청크로 잘려 병렬로 돈다. */
  items: readonly Item[];
  /** 시스템 인스트럭션 — 이 판정이 무엇을 묻는지. */
  systemInstruction: string;
  /** 청크 하나를 프롬프트 문자열로. */
  format: (chunk: Item[]) => string;
  /** 모델의 답을 그 청크의 판정으로. 예외를 던지면 청크 실패로 취급한다. */
  parse: (text: string, chunk: Item[]) => Verdict;
  onCall?: (measurement: PolishCallMeasurement) => void;
}

export interface JudgePoolResult<Verdict> {
  /** 성공한 청크의 판정, 청크 순서대로. 실패한 청크는 빠져 있다. */
  verdicts: Verdict[];
  totalChunks: number;
  failedChunks: number;
}

/**
 * `/polish`의 **판정** 호출을 도는 공통 뼈대.
 *
 * 규칙 적용 경로에는 성격이 같은 모델 호출이 여럿이다 — 짧은 주고받음 합치기,
 * 토막 자막 잇기. 셋째가 생기기 전에 뽑아 뒀다: 청크 분할·동시성·실패 격리·
 * 사용량 계측은 어느 판정이든 똑같고, 다른 것은 **무엇을 묻고 답을 어떻게
 * 읽는가**(`systemInstruction`·`format`·`parse`)뿐이다.
 *
 * 줄바꿈(`splitLongLines`)은 여기 안 얹었다. 그쪽은 산출물이 판정이 아니라
 * **자막 자체**라서 재조립(`reassembleTranslatedChunk`)과 원문 폴백이 붙는다 —
 * 같은 함수에 넣으면 두 성격이 한 자리에서 섞인다.
 *
 * **청크 하나가 실패하면 그 청크만 버린다.** 판정이 없으면 아무것도 안 바뀌고,
 * 원본 유지가 이 경로의 기본값이므로 실패는 곧 "아무 일도 안 일어남"이다.
 */
export async function judgeInChunks<Item, Verdict>({
  items,
  systemInstruction,
  format,
  parse,
  onCall,
}: JudgePoolOptions<Item, Verdict>): Promise<JudgePoolResult<Verdict>> {
  if (items.length === 0) {
    return { verdicts: [], totalChunks: 0, failedChunks: 0 };
  }

  const chunks: Item[][] = [];
  for (let i = 0; i < items.length; i += POLISH_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + POLISH_CHUNK_SIZE));
  }

  const results = await runOrderedPool<Item[], Verdict>({
    items: chunks,
    concurrency: SERVER_CONCURRENCY,
    worker: async (chunk, index) => {
      const startedAt = Date.now();
      try {
        const { text, usage, thinkingLevel } =
          await geminiProvider.generateText({
            model: FLASH_MODEL,
            prompt: format(chunk),
            translationMode: 'chunk',
            systemInstruction,
          });
        onCall?.({
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          // 이 경로의 "블록"은 자막이 아니라 판정 대상(쌍·구간)의 수다.
          // 사용량은 규칙 적용과 같은 `phase='polish'`로 남는다 — 같은 화면·
          // 같은 라우트·같은 한도라 축을 새로 파면 청구서만 갈라진다.
          blocks: chunk.length,
          model: FLASH_MODEL,
          thinkingLevel,
          usage,
          latencyMs: Date.now() - startedAt,
          ok: true,
        });
        return parse(text, chunk);
      } catch (error) {
        // 실패한 청크도 지연을 썼고 실제로 일어났다 — 토큰 0짜리 행을 남긴다.
        onCall?.({
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          blocks: chunk.length,
          model: FLASH_MODEL,
          thinkingLevel: null,
          usage: { prompt: 0, cached: 0, thoughts: 0, output: 0 },
          latencyMs: Date.now() - startedAt,
          ok: false,
          errorCode: classifyError(error),
        });
        throw error;
      }
    },
  });

  const verdicts: Verdict[] = [];
  let failedChunks = 0;
  for (const result of results) {
    if (result === undefined) {
      failedChunks++;
      continue;
    }
    verdicts.push(result);
  }

  return { verdicts, totalChunks: chunks.length, failedChunks };
}
