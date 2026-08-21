import { describe, expect, it } from 'vitest';

import { applyTermPatch, removeTermAt } from './castSheetEdit';
import type { CastSheet } from '../types/glossary';

const sheet = (): CastSheet => ({
  terms: [
    { source: 'Camillo', target: '카밀로 벨로키오', kind: 'person' },
    { source: 'Marco', target: '마르코 벨로키오', kind: 'person' },
    { source: 'Piacenza', target: '피아첸차', kind: 'place' },
  ],
  relations: [
    {
      from: '카밀로 벨로키오',
      to: '마르코 벨로키오',
      speech: 'informal',
      fromBlock: 1,
      toBlock: 100,
    },
  ],
  narration: 'none',
});

describe('applyTermPatch', () => {
  it('표기를 고치면 관계가 따라 바뀐다 — 버리지 않는다', () => {
    // 2026-08-21 회귀: 풀네임을 줄이자 말투 표가 통째로 사라졌다. 관계는
    // 사람을 target 문자열로 가리키므로, 이름 교정을 삭제로 읽으면 안 된다.
    const next = applyTermPatch(sheet(), 0, { target: '카밀로' });

    expect(next.relations).toHaveLength(1);
    expect(next.relations[0].from).toBe('카밀로');
    expect(next.relations[0].to).toBe('마르코 벨로키오');
    expect(next.relations[0].speech).toBe('informal');
  });

  it('같은 target을 쓰는 항목이 남아 있으면 관계를 따라 바꾸지 않는다', () => {
    // 축약형·전체형이 한 사람을 가리키는 정상 데이터. 한쪽을 고쳐도 다른
    // 쪽이 여전히 그 이름을 대므로 관계는 그대로 유효하다.
    const base = sheet();
    base.terms.push({
      source: 'Camillo Bellocchio',
      target: '카밀로 벨로키오',
      kind: 'person',
    });

    const next = applyTermPatch(base, 0, { target: '카밀로' });

    expect(next.relations[0].from).toBe('카밀로 벨로키오');
  });

  it('인물에서 다른 유형으로 바꾸면 그 사람이 낀 관계는 버린다', () => {
    const next = applyTermPatch(sheet(), 0, { kind: 'place' });
    expect(next.relations).toHaveLength(0);
  });

  it('표기와 무관한 수정은 관계를 건드리지 않는다', () => {
    const next = applyTermPatch(sheet(), 0, { note: '마르코의 쌍둥이 형제' });
    expect(next.relations).toEqual(sheet().relations);
  });
});

describe('removeTermAt', () => {
  it('지운 사람이 낀 관계를 버린다', () => {
    expect(removeTermAt(sheet(), 0).relations).toHaveLength(0);
  });

  it('같은 target을 쓰는 항목이 남아 있으면 관계를 살린다', () => {
    const base = sheet();
    base.terms.push({
      source: 'Camillo Bellocchio',
      target: '카밀로 벨로키오',
      kind: 'person',
    });

    expect(removeTermAt(base, 0).relations).toHaveLength(1);
  });

  it('관계와 무관한 항목을 지워도 관계는 남는다', () => {
    expect(removeTermAt(sheet(), 2).relations).toHaveLength(1);
  });
});
