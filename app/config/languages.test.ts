import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_TARGET_LANG,
  getEnabledTargetLang,
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
