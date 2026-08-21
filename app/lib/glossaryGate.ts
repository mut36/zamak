import { GLOSSARY_ENABLED } from '../config/constants';
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
