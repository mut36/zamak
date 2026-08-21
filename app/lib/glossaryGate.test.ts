import { describe, expect, it } from 'vitest';

import { glossaryAppliesTo } from './glossaryGate';
import { FLASH_MODEL, PRO_MODEL } from '../config/constants';

describe('glossaryAppliesTo', () => {
  it('프로 모델이면 참', () => {
    expect(glossaryAppliesTo(PRO_MODEL)).toBe(true);
  });

  it('라이트 모델이면 거짓', () => {
    expect(glossaryAppliesTo(FLASH_MODEL)).toBe(false);
  });

  it('모르는 모델이면 거짓 — creditKindForModel이 lite로 떨어뜨린다', () => {
    expect(glossaryAppliesTo('gemini-someday-9000')).toBe(false);
  });
});
