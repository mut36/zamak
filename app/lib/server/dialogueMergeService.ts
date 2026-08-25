import 'server-only';

import { geminiProvider } from '../providers/gemini';
import { classifyError } from '../translationErrors';
import { loadDialogueMergeRules } from '../prompts/loader';
import { getEnabledTargetLang } from '../../config/languages';
import {
  formatCandidatesForModel,
  readMergeVerdicts,
  type DialogueCandidate,
} from '../mergeDialogue';
import { runOrderedPool } from '../client/concurrency';
import {
  FLASH_MODEL,
  POLISH_CHUNK_SIZE,
  SERVER_CONCURRENCY,
} from '../../config/constants';
import type { PolishCallMeasurement } from './polishService';

export interface DialogueMergeServiceResult {
  /** 합치라고 판정된 후보 번호. */
  approved: number[];
  totalChunks: number;
  failedChunks: number;
}

/**
 * 후보 쌍 중 **정말 두 화자의 주고받음인 것**을 고른다.
 *
 * `splitLongLines`와 같은 뼈대(청크 → 풀 → 실패 청크 격리)를 쓰지만 산출물이
 * 다르다: 자막을 고쳐 돌려주는 게 아니라 번호 목록만 돌려준다. 그래서 재조립도
 * 없고, 모델이 자막 텍스트를 건드릴 경로 자체가 없다 — 판정이 아무리 엉뚱해도
 * 최악은 "안 합침" 또는 "합치면 안 될 둘을 합침"이고, 대사가 바뀌지는 않는다.
 *
 * 청크 하나가 실패하면 그 청크의 후보는 전부 **미승인**으로 남는다. 원본 유지가
 * 이 경로의 기본값이므로, 실패는 곧 "아무 일도 안 일어남"이다.
 */
export async function judgeDialogueCandidates(
  candidates: readonly DialogueCandidate[],
  targetLanguage: string,
  onCall?: (measurement: PolishCallMeasurement) => void,
): Promise<DialogueMergeServiceResult> {
  if (candidates.length === 0) {
    return { approved: [], totalChunks: 0, failedChunks: 0 };
  }

  const lang = getEnabledTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }
  const systemInstruction = await loadDialogueMergeRules(lang.code);

  const chunks: DialogueCandidate[][] = [];
  for (let i = 0; i < candidates.length; i += POLISH_CHUNK_SIZE) {
    chunks.push(candidates.slice(i, i + POLISH_CHUNK_SIZE));
  }

  const results = await runOrderedPool<DialogueCandidate[], number[]>({
    items: chunks,
    concurrency: SERVER_CONCURRENCY,
    worker: async (chunk, index) => {
      const startedAt = Date.now();
      try {
        const { text, usage, thinkingLevel } =
          await geminiProvider.generateText({
            model: FLASH_MODEL,
            prompt: formatCandidatesForModel(chunk),
            translationMode: 'chunk',
            systemInstruction,
          });
        onCall?.({
          chunkIndex: index + 1,
          totalChunks: chunks.length,
          // 이 경로의 "블록"은 자막이 아니라 후보 쌍이다. 사용량은 규칙 적용과
          // 같은 `phase='polish'`로 남는다 — 같은 화면·같은 라우트·같은 한도라
          // 축을 새로 파면 청구서만 갈라진다.
          blocks: chunk.length,
          model: FLASH_MODEL,
          thinkingLevel,
          usage,
          latencyMs: Date.now() - startedAt,
          ok: true,
        });
        const expected = new Set(chunk.map((c) => c.id));
        return [...readMergeVerdicts(text, expected)];
      } catch (error) {
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

  let failedChunks = 0;
  const approved: number[] = [];
  for (const result of results) {
    if (result === undefined) {
      failedChunks++;
      continue;
    }
    approved.push(...result);
  }

  return { approved, totalChunks: chunks.length, failedChunks };
}
