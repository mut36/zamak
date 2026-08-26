import 'server-only';

import { loadFragmentJoinRules } from '../prompts/loader';
import { getEnabledTargetLang } from '../../config/languages';
import {
  formatRunsForModel,
  readJoinGroups,
  type FragmentRun,
} from '../joinFragments';
import { judgeInChunks } from './judgePool';
import type { PolishCallMeasurement } from './polishService';

/** 런 번호 → 그 안에서 한 문장을 이루는 자리 묶음들. */
export type FragmentJoinPlan = Record<number, number[][]>;

export interface FragmentJoinServiceResult {
  /** 이으라고 판정된 묶음. 런 번호를 키로 쓰는 평범한 객체 — JSON으로 나간다. */
  groups: FragmentJoinPlan;
  totalChunks: number;
  failedChunks: number;
}

/**
 * 토막 자막의 런에서 **한 문장의 경계**를 받아 온다.
 *
 * 대화 합치기와 같은 뼈대(`judgeInChunks`)를 쓰지만 답의 모양이 다르다. 저쪽은
 * 쌍마다 예/아니오 하나면 되지만, 여기서는 **런 안에서 어디까지가 한 문장인가**를
 * 받아야 한다 — 그 경계가 곧 이 기능의 전부이고, 코드가 글자 수로 정하지 않기로
 * 한 바로 그 값이다.
 *
 * 여기서도 모델은 대사를 못 건드린다. 돌아오는 것은 자리 번호뿐이다.
 */
export async function judgeFragmentRuns(
  runs: readonly FragmentRun[],
  targetLanguage: string,
  onCall?: (measurement: PolishCallMeasurement) => void,
): Promise<FragmentJoinServiceResult> {
  if (runs.length === 0) {
    return { groups: {}, totalChunks: 0, failedChunks: 0 };
  }

  const lang = getEnabledTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  const { verdicts, totalChunks, failedChunks } = await judgeInChunks<
    FragmentRun,
    FragmentJoinPlan
  >({
    items: runs,
    systemInstruction: await loadFragmentJoinRules(lang.code),
    format: formatRunsForModel,
    parse: (text, chunk) =>
      Object.fromEntries(readJoinGroups(text, chunk)) as FragmentJoinPlan,
    onCall,
  });

  return {
    groups: Object.assign({}, ...verdicts) as FragmentJoinPlan,
    totalChunks,
    failedChunks,
  };
}
