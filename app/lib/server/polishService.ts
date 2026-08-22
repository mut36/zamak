import 'server-only';

import { geminiProvider } from '../providers/gemini';
import type { TokenUsage } from '../providers';
import { classifyError } from '../translationErrors';
import { composeLineSplitPrompt } from '../prompts/lineSplit';
import {
  chunkSrtBlocks,
  formatBlocksForModel,
  parseSrtBlocks,
  reassembleTranslatedChunk,
} from '../srt';
import { runOrderedPool } from '../client/concurrency';
import {
  FLASH_MODEL,
  POLISH_CHUNK_SIZE,
  SERVER_CONCURRENCY,
} from '../../config/constants';

/**
 * 청크 한 개를 돈 모델 호출의 측정치. 서비스는 이걸 **돌려줄 뿐**이고 어디에
 * 쓰는지는 라우트가 정한다 — 여기서 DB에 쓰면 이 모듈이 요청의 신원을 알아야
 * 하고, 그건 translationService가 청크 사용량을 다루는 방식과 어긋난다.
 */
export interface PolishCallMeasurement {
  chunkIndex: number;
  totalChunks: number;
  blocks: number;
  model: string;
  thinkingLevel: string | null;
  usage: TokenUsage;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
}

export interface PolishServiceResult {
  /** 재조립된 SRT. 실패한 청크의 블록은 원문 그대로 들어 있다. */
  content: string;
  totalChunks: number;
  failedChunks: number;
}

/**
 * 상한을 넘는 줄을 의미 단위로 나눈다.
 *
 * 입력 `subset`은 `collectOverLongBlocks`가 만든, 원본 번호·타임코드를 그대로
 * 든 SRT다. 번호가 연속이 아니어도 `reassembleTranslatedChunk`가 정상 동작한다 —
 * 그 함수는 위치가 아니라 번호로 대조하고, 모델이 모르는 번호를 뱉으면
 * `expected` 집합이 걸러낸다. 모델이 뱉은 타임스탬프도 거기서 버려지므로
 * 타임코드는 언제나 소스에서 온다.
 *
 * 청크 하나가 실패하면 **그 청크만 버린다.** 해당 블록들은 원문을 유지하고
 * 나머지는 정상 처리된다 — 규칙 적용은 개선이지 필수 변환이 아니라서, 일부가
 * 안 나뉘어도 결과물은 여전히 정상 자막이다. (번역은 한 청크가 실패하면 그
 * 구간이 외국어로 남아 못 쓰지만, 여기는 원문이 이미 한국어다.)
 */
export async function splitLongLines(
  subset: string,
  targetLanguage: string,
  onCall?: (measurement: PolishCallMeasurement) => void,
): Promise<PolishServiceResult> {
  const blocks = parseSrtBlocks(subset);
  if (blocks.length === 0) {
    return { content: '', totalChunks: 0, failedChunks: 0 };
  }

  const systemInstruction = await composeLineSplitPrompt(targetLanguage);
  const chunks = chunkSrtBlocks(blocks, POLISH_CHUNK_SIZE);

  const results = await runOrderedPool<string, string>({
    items: chunks,
    concurrency: SERVER_CONCURRENCY,
    worker: async (chunk, index) => {
      const blocks = parseSrtBlocks(chunk).length;
      const startedAt = Date.now();
      try {
        const { text, usage, thinkingLevel } =
          await geminiProvider.generateText({
            model: FLASH_MODEL,
            prompt: formatBlocksForModel(chunk),
            translationMode: 'chunk',
            systemInstruction,
          });
        onCall?.({
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          blocks,
          model: FLASH_MODEL,
          thinkingLevel,
          usage,
          latencyMs: Date.now() - startedAt,
          ok: true,
        });
        return reassembleTranslatedChunk(chunk, text).content;
      } catch (error) {
        // 실패한 청크도 지연을 썼고 실제로 일어났다 — 토큰 0짜리 행을 남긴다.
        // 여기서 삼키지 않고 다시 던진다: 원문 유지 분기는 pool이 맡는다.
        onCall?.({
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          blocks,
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

  let failedChunks = 0;
  const rebuilt = results.map((result, index) => {
    if (result !== undefined) return result;
    failedChunks++;
    // 원문 유지 — 이 청크의 블록들은 안 나뉜 채로 나간다.
    return chunks[index];
  });

  return {
    content: rebuilt.join('\n\n'),
    totalChunks: chunks.length,
    failedChunks,
  };
}
