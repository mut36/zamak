import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  CONTENT_PROFILE_KEYS,
  DEFAULT_CONTENT_PROFILE,
  DEFAULT_TARGET_LANG,
  getEnabledTargetLang,
  resolveSubtitleShape,
  resolveTargetLang,
  TARGET_LANGS,
} from './languages';

describe('target language table', () => {
  it('has a rules prompt on disk for every enabled language', () => {
    for (const lang of TARGET_LANGS.filter((l) => l.enabled)) {
      const file = path.join(
        process.cwd(),
        'prompts',
        'common',
        `translation_rules_${lang.code}.txt`,
      );
      expect(existsSync(file), `missing ${file}`).toBe(true);
    }
  });

  it('uses unique codes and a default that is actually enabled', () => {
    const codes = TARGET_LANGS.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(getEnabledTargetLang(DEFAULT_TARGET_LANG)).toBeDefined();
  });

  it('never resolves an unknown code to a language it cannot translate', () => {
    expect(getEnabledTargetLang('sv')).toBeUndefined();
    // Display paths still need something to render, and that fallback is the
    // default language — never a half-configured row.
    expect(resolveTargetLang('sv').code).toBe(DEFAULT_TARGET_LANG);
  });
});

describe('subtitle shapes (language × content profile)', () => {
  it('gives every enabled language a band for every profile', () => {
    for (const lang of TARGET_LANGS.filter((l) => l.enabled)) {
      for (const key of CONTENT_PROFILE_KEYS) {
        expect(lang.shapes[key], `${lang.code}/${key}`).toBeDefined();
      }
    }
  });

  it('keeps line length off the profile axis', () => {
    // 한 줄 자수는 도착어 하나로만 결정된다 — 프로필별로 나누면 같은 언어인데
    // 종류에 따라 번역문 자체가 달라진다(decisions.md §1-19).
    for (const lang of TARGET_LANGS) {
      expect(lang.lineMaxChars).toBeGreaterThan(0);
    }
    expect(TARGET_LANGS[0].lineMaxChars).toBe(18);
  });

  it('keeps the ceiling above the target in every shape', () => {
    // adjustSubtitleTiming only touches blocks above hardMax and pulls them to
    // target. Inverted, a "fix" would push the block back past the trigger.
    for (const lang of TARGET_LANGS) {
      for (const key of CONTENT_PROFILE_KEYS) {
        const { target, hardMax } = lang.shapes[key];
        expect(hardMax, `${lang.code}/${key}`).toBeGreaterThan(target);
      }
    }
  });

  it('separates the Korean profiles — this is the feature, not decoration', () => {
    const speeds = CONTENT_PROFILE_KEYS.map(
      (key) => resolveSubtitleShape('ko', key).target,
    );
    expect(new Set(speeds).size).toBe(CONTENT_PROFILE_KEYS.length);

    // 예능이 가장 느긋하고 강연·토크가 가장 촘촘하다 — 순서가 뒤집히면
    // 프로필이 하는 말과 반대로 동작한다(docs/tuning/reading-speed.md §3).
    const speed = (key: Parameters<typeof resolveSubtitleShape>[1]) =>
      resolveSubtitleShape('ko', key).target;
    expect(speed('variety')).toBeLessThan(speed('movie'));
    expect(speed('talk')).toBeGreaterThan(speed('movie'));

    // 영화 프로필은 프로필 도입 전의 한국어 밴드 그대로 — 상한 12는 Netflix
    // 한국어 성인 상한이고, 기본 프로필이라 미지정 요청도 예전과 같이 동작한다.
    expect(resolveSubtitleShape('ko', 'movie')).toEqual({
      target: 10,
      hardMax: 12,
    });
  });

  it('falls back to the default profile instead of throwing on junk', () => {
    // Older clients and direct API calls send no profile at all; rendering the
    // subtitle as a film beats refusing to render it.
    const fallback = resolveSubtitleShape('ko', 'not-a-profile');
    expect(fallback).toEqual(resolveSubtitleShape('ko', DEFAULT_CONTENT_PROFILE));
    expect(resolveSubtitleShape('ko', undefined)).toEqual(fallback);
  });
});
