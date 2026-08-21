import {
  DIRECTOR_NOTE_ENABLED,
  GLOSSARY_ENABLED,
} from '../config/constants';
import { creditKindForModel } from './creditKind';

/**
 * 이 번역에 글로사리가 붙는가. **클라이언트와 서버가 함께 읽는 단 하나의
 * 판정**이다 — §6-7이 세운 "양쪽 끝에서 같은 값을 읽는다" 패턴 그대로다.
 * 한쪽만 보게 두면, 화면은 안 보여주는데 프롬프트에는 들어가는(또는 그 반대인)
 * 상태가 조용히 생긴다.
 *
 * 모르는 모델이 라이트로 떨어지는 것은 `creditKindForModel`의 의도된 성질이고
 * 여기서도 안전한 쪽이다 — 안 붙는 것이 잘못 붙는 것보다 낫다.
 */
export function glossaryAppliesTo(model: string): boolean {
  return GLOSSARY_ENABLED && creditKindForModel(model) === 'pro';
}

/**
 * 이 번역에 연출 메모 프리패스가 붙는가. `glossaryAppliesTo`와 **같은 판정
 * 구조**를 일부러 유지한다 — 클라이언트와 서버가 한 함수를 같이 읽고, 모르는
 * 모델은 라이트로 떨어져 안 붙는다.
 *
 * 글로사리와 별개의 스위치를 쓰는 이유: 둘은 한 스위치의 양면이 아니다.
 * 추출 프로바이더가 죽으면 `DIRECTOR_NOTE_ENABLED`만 내려야 하고,
 * 글로사리를 되살리는 실험은 `GLOSSARY_ENABLED`만 올려야 한다. 한 값에 묶으면
 * 그 두 동작이 서로를 끌고 다닌다.
 */
export function directorNoteAppliesTo(model: string): boolean {
  return DIRECTOR_NOTE_ENABLED && creditKindForModel(model) === 'pro';
}
