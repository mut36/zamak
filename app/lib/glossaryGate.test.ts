import { describe, expect, it } from 'vitest';

import { directorNoteAppliesTo, glossaryAppliesTo } from './glossaryGate';
import { FLASH_MODEL, PRO_MODEL } from '../config/constants';

/**
 * 두 게이트는 같은 자리(파일당 한 번 도는 프리패스)를 두고 갈린다. 오늘은
 * 글로사리 쪽 차단기가 내려가 있고 메모 쪽이 켜져 있다 — 그 사실 자체가
 * 여기서 지켜야 할 계약이다. 표를 되살리는 실험은 이 테스트를 먼저 뒤집는다.
 */
describe('glossaryAppliesTo', () => {
  it('차단기가 내려가 있으므로 프로 모델도 거짓', () => {
    expect(glossaryAppliesTo(PRO_MODEL)).toBe(false);
  });

  it('라이트 모델이면 거짓', () => {
    expect(glossaryAppliesTo(FLASH_MODEL)).toBe(false);
  });
});

describe('directorNoteAppliesTo', () => {
  it('프로 모델이면 참', () => {
    expect(directorNoteAppliesTo(PRO_MODEL)).toBe(true);
  });

  it('라이트 모델이면 거짓', () => {
    expect(directorNoteAppliesTo(FLASH_MODEL)).toBe(false);
  });

  it('모르는 모델이면 거짓 — creditKindForModel이 lite로 떨어뜨린다', () => {
    expect(directorNoteAppliesTo('gemini-someday-9000')).toBe(false);
  });
});
