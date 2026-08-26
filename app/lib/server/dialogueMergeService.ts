import 'server-only';

import { loadDialogueMergeRules } from '../prompts/loader';
import { getPolishTargetLang } from '../../config/languages';
import {
  formatCandidatesForModel,
  readMergeVerdicts,
  type DialogueCandidate,
} from '../mergeDialogue';
import { judgeInChunks } from './judgePool';
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
 * 청크 분할·동시성·실패 격리는 `judgeInChunks`가 맡는다. 여기 남는 것은 이
 * 판정에만 있는 것 — 무엇을 묻고(프롬프트), 답을 어떻게 읽는가(`readMergeVerdicts`).
 *
 * 산출물이 번호 목록뿐이라는 점이 이 경로의 안전장치다: 모델이 자막 텍스트를
 * 건드릴 통로가 없어, 판정이 아무리 엉뚱해도 최악은 "안 합침"이거나 "합치면
 * 안 될 둘을 합침"이고 대사가 바뀌지는 않는다.
 */
export async function judgeDialogueCandidates(
  candidates: readonly DialogueCandidate[],
  targetLanguage: string,
  onCall?: (measurement: PolishCallMeasurement) => void,
): Promise<DialogueMergeServiceResult> {
  if (candidates.length === 0) {
    return { approved: [], totalChunks: 0, failedChunks: 0 };
  }

  const lang = getPolishTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  const { verdicts, totalChunks, failedChunks } = await judgeInChunks<
    DialogueCandidate,
    number[]
  >({
    items: candidates,
    systemInstruction: await loadDialogueMergeRules(lang.code),
    format: formatCandidatesForModel,
    parse: (text, chunk) => [
      ...readMergeVerdicts(text, new Set(chunk.map((c) => c.id))),
    ],
    onCall,
  });

  return { approved: verdicts.flat(), totalChunks, failedChunks };
}
