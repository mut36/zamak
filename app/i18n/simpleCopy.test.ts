import { describe, expect, it } from 'vitest';

import { COPY } from './simpleCopy';
import { computeCps } from '../lib/srt';
import {
  CONTENT_PROFILE_KEYS,
  resolveSubtitleShape,
  resolveTargetLang,
  type ContentProfileKey,
} from '../config/languages';

/**
 * The landing page sells 권장 읽기 속도 as "what the engine does". These numbers
 * were design-handoff examples once, and drifted from the engine without anyone
 * noticing — see docs/decisions.md §1-18. These tests make the copy fail loudly
 * instead of lying quietly: every number in the CPS section has to be derivable
 * from the profile table or from the sample line printed on the same card.
 */
describe('COPY.landing.cps mirrors the engine', () => {
  const profiles = COPY.landing.cps.profiles;

  it('lists the same profiles, in the same order, as the shape table', () => {
    expect(profiles.map((p) => p.key)).toEqual(CONTENT_PROFILE_KEYS);
  });

  it.each(profiles)('$name quotes the real target speed', ({ key, value }) => {
    const shape = resolveSubtitleShape('ko', key as ContentProfileKey);
    expect(value).toBe(String(shape.target));
  });

  it('sells no per-profile line budget — that axis is the language, not the profile', () => {
    // 한 줄 자수를 프로필별로 파는 순간 번역문 자체가 종류에 따라 달라져야
    // 한다는 약속이 된다. 그 축은 도착어 하나뿐이다(decisions.md §1-19).
    const text = JSON.stringify(COPY.landing.cps);
    expect(text).not.toContain('한 줄');
  });

  it.each(profiles)(
    '$name shows a sample that actually obeys that profile',
    ({ key, lines, tc, measured }) => {
      const shape = resolveSubtitleShape('ko', key as ContentProfileKey);

      // 줄 수는 프로필 무관 2줄, 줄 길이는 도착어의 예산을 지켜야 한다.
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect([...line].length).toBeLessThanOrEqual(
          resolveTargetLang('ko').lineMaxChars,
        );
      }

      // 카드에 찍힌 CPS는 같은 카드의 대사·타임코드에서 나와야 한다 — 화면의
      // 숫자와 계산이 어긋나면 그게 바로 §1-18이 잡은 종류의 거짓말이다.
      const block = `1\n${tc.replace(' → ', ' --> ')}\n${lines.join('\n')}`;
      const cps = computeCps(block)?.cps;
      expect(cps).not.toBeNull();
      expect(measured).toBe(`CPS ${cps!.toFixed(1)} ✓`);

      // 그리고 그 값은 프로필의 권장 속도 안에 들어와야 ✓를 붙일 수 있다.
      expect(cps!).toBeLessThanOrEqual(shape.target);
    },
  );

  it('states the two-line cap the prompt and enforceTextRules both apply', () => {
    expect(COPY.landing.cps.lineCountValue).toBe('최대 2줄');
  });
});
