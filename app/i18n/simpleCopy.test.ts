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

/**
 * 비교 섹션도 CPS 숫자를 판다. `COPY.landing.cps`(프로필 카드)에는 위 회귀
 * 테스트가 걸려 있었지만 여기엔 없었고, 2026-08-03 점검에서 세 엔진의 태그가
 * 전부 1.0씩 낮게 적혀 있는 걸 발견했다 — 화면에 찍히는 화자 대시(`- `,
 * 2글자 = 2.0초에서 정확히 1.0 CPS)를 안 세고 계산한 값이었다.
 *
 * 여기 숫자는 경쟁사 대비 우위를 주장하는 **비교 광고**라 프로필 카드보다
 * 리스크가 크다(`docs/decisions.md` §1-15). 그래서 표시값을 믿지 않고 같은
 * 카드의 대사에서 엔진으로 다시 계산해 대조한다.
 */
describe('COPY.landing.compare의 CPS 태그가 대사에서 나온다', () => {
  const compare = COPY.landing.compare;
  /** sourceMeta가 파는 노출 시간. 태그 계산의 유일한 가정이라 여기서 고정한다. */
  const EXPOSURE_MS = 2_000;

  it('sourceMeta가 그 노출 시간을 실제로 명시한다', () => {
    expect(compare.sourceMeta).toContain(`${(EXPOSURE_MS / 1000).toFixed(1)}초`);
  });

  /** 한 줄을 단일 블록으로 만들어 computeCps에 그대로 태운다. */
  function lineCps(line: string): number {
    const end = `00:00:0${EXPOSURE_MS / 1000},000`;
    const cps = computeCps(`1\n00:00:00,000 --> ${end}\n${line}`)?.cps;
    expect(cps).not.toBeNull();
    return cps!;
  }

  it.each(compare.engines)('$name의 태그가 실제 CPS와 일치한다', ({ out, tags }) => {
    const tag = tags.find((t) => t.label.startsWith('CPS '));
    expect(tag, 'CPS 태그가 없다').toBeDefined();

    // 표기 기준은 "가장 빡센 줄" — 두 줄 중 하나라도 상한을 넘으면 그 블록은
    // 화면에서 안 읽힌다. 평균으로 뭉개면 그 사실이 사라진다.
    const worst = Math.max(...out.split('\n').map(lineCps));
    expect(tag!.label).toContain(`CPS ${worst.toFixed(1)}`);
  });

  it.each(compare.engines)('$name의 판정 문구가 상한과 앞뒤가 맞는다', ({ out, tags }) => {
    const shape = resolveSubtitleShape('ko', 'movie');
    const worst = Math.max(...out.split('\n').map(lineCps));
    const label = tags.find((t) => t.label.startsWith('CPS '))!.label;

    // 상한을 넘었으면 "초과"라고 불러야 하고, 넘지 않았으면 "충족"이라
    // 불러도 된다. 넘었는데 순한 말로 적는 게 §1-15가 잡은 종류의 거짓말이다.
    if (worst > shape.hardMax) {
      expect(label, `${worst} > 상한 ${shape.hardMax}`).toContain('초과');
    } else {
      expect(label, `${worst} ≤ 상한 ${shape.hardMax}`).toContain('충족');
    }
  });

  it('상한을 넘긴 엔진은 모두 red로 표시된다', () => {
    const shape = resolveSubtitleShape('ko', 'movie');
    for (const { name, out, tags } of compare.engines) {
      const worst = Math.max(...out.split('\n').map(lineCps));
      if (worst <= shape.hardMax) continue;
      const tag = tags.find((t) => t.label.startsWith('CPS '))!;
      expect(tag.tone, `${name}: 상한 초과인데 ${tag.tone}`).toBe('red');
    }
  });

  it('ZAMAK만 상한을 지킨다 — 그게 이 섹션이 파는 주장이다', () => {
    const shape = resolveSubtitleShape('ko', 'movie');
    const passing = compare.engines
      .filter((e) => Math.max(...e.out.split('\n').map(lineCps)) <= shape.hardMax)
      .map((e) => e.name);
    expect(passing).toEqual(['ZAMAK']);
  });
});

/**
 * 속도 숫자는 화면 세 곳에 흩어져 있다 — 랜딩 히어로, 랜딩 속도 섹션, 그리고
 * 설정 화면의 라이트 카드. 2026-08-03 점검에서 히어로·라이트 카드가 10초,
 * 속도 섹션이 12초로 **같은 페이지 안에서 서로 모순**인 채 배포 직전까지 갔다
 * (`docs/decisions.md` §1-15 개정). 7/31에 12초로 정한 결정이 두 곳에 반영되지
 * 않았는데도 아무것도 실패하지 않았기 때문이다. 이 테스트가 그 침묵을 없앤다.
 */
describe('COPY: 속도 문구가 한 숫자로 통일돼 있다', () => {
  /** "…15초…" 형태에서 초 단위 숫자만 뽑는다. */
  function seconds(text: string): number[] {
    return [...text.matchAll(/(\d+(?:\.\d+)?)초/g)].map((m) => Number(m[1]));
  }

  const places = {
    '랜딩 히어로': COPY.landing.hero.sub,
    '랜딩 속도 섹션': COPY.landing.speed.titleAccent,
    '설정 라이트 카드': COPY.settings.liteDesc,
  };

  it('세 자리가 모두 같은 초를 판다', () => {
    const found = Object.entries(places).map(([where, text]) => {
      const secs = seconds(text);
      expect(secs, `${where}에 초 단위 수치가 없다`).toHaveLength(1);
      return secs[0];
    });
    expect(new Set(found).size, `서로 다른 값: ${found.join(' / ')}`).toBe(1);
  });

  it('그 값은 실측 최악값(한 웨이브 기준 14.8초)을 덮는다', () => {
    // 461블록 13.4초 · 1,124블록 14.8초 (experiment-log.md 2026-08-03).
    // 파는 숫자가 실측보다 짧으면 첫 화면부터 거짓이 된다.
    expect(seconds(COPY.landing.speed.titleAccent)[0]).toBeGreaterThanOrEqual(
      14.8,
    );
  });

  it('조건 단서 없이 속도를 파는 자리가 없다', () => {
    // 조건 없는 숫자는 크레딧 상한(2,000블록·2웨이브·~18초)짜리 파일에 대해
    // 거짓이 된다. 히어로·라이트 카드는 "드라마 한 편"을 달고, 속도 섹션은
    // titleTop과 note가 그 역할을 한다.
    expect(COPY.landing.hero.sub).toContain('드라마 한 편');
    expect(COPY.settings.liteDesc).toContain('드라마 한 편');
    expect(COPY.landing.speed.titleTop).toContain('드라마 한 편');
    expect(COPY.landing.speed.note).toContain('1,600블록');
  });

  it('진행링 추정은 파는 숫자보다 길다', async () => {
    // 링은 99%로 수렴하다 결과가 와야 100%가 된다 — 추정이 짧으면 기어간다.
    // 파는 숫자는 짧은 쪽, 기다리게 하는 숫자는 긴 쪽 (`decisions.md` §1-15).
    const { TRANSLATION_ESTIMATE_MS, FLASH_MODEL } = await import(
      '../config/constants'
    );
    const sold = seconds(COPY.landing.speed.titleAccent)[0] * 1000;
    expect(TRANSLATION_ESTIMATE_MS[FLASH_MODEL]).toBeGreaterThan(sold);
  });
});
