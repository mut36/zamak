import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GoogleGenAI } from '@google/genai';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { composeTranslationPrompt } from './index';
import { FLASH_MODEL } from '../../config/constants';
import { TARGET_LANGS } from '../../config/languages';
import { parseSrtBlocks, reassembleTranslatedChunk } from '../srt';

const KEY = process.env.GOOGLE_GENAI_API_KEY;
const ENABLED = Boolean(KEY && process.env.LIVE_LANG_SMOKE);

const BLOCKS = 12;

/**
 * Real Gemini calls, one per enabled target language — the only check that a
 * newly added language actually produces that language while keeping the
 * marker contract (invariant 1: input blocks === output blocks). Costs money
 * and needs a key, so it is opt-in:
 *
 *   LIVE_LANG_SMOKE=1 npx vitest run app/lib/prompts/liveLang.smoke.test.ts
 *
 * Each translation is written to a temp dir (path printed) for eyeballing the
 * conventions the automated assertions can't judge — punctuation, register,
 * line length.
 */
describe.skipIf(!ENABLED)('live target-language smoke', () => {
  const outDir = ENABLED
    ? mkdtempSync(path.join(tmpdir(), 'zamak-lang-smoke-'))
    : '';

  for (const lang of TARGET_LANGS.filter((l) => l.enabled)) {
    it(
      `translates a real chunk into ${lang.code} with the block count intact`,
      { timeout: 120_000 },
      async () => {
        const srt = parseSrtBlocks(
          readFileSync('samples/subtitles/drama-episode.srt', 'utf8'),
        )
          .slice(0, BLOCKS)
          .join('\n\n');

        const { system, user } = await composeTranslationPrompt('gemini', {
          movieInfo: { title: 'Test', year: '2026', notes: '' },
          targetLanguage: lang.code,
          translationMode: 'chunk',
          translationStyle: 'meaning',
          subtitleContent: srt,
          chunkPosition: { index: 1, total: 1 },
        });

        const ai = new GoogleGenAI({ apiKey: KEY });
        const response = await ai.models.generateContent({
          model: FLASH_MODEL,
          contents: user,
          config: { systemInstruction: system },
        });

        const result = reassembleTranslatedChunk(srt, response.text ?? '');
        const outFile = path.join(outDir, `${lang.code}.srt`);
        writeFileSync(outFile, result.content);
        console.log(`[${lang.code}] ${outFile}`);

        expect(result.total).toBe(BLOCKS);
        expect(result.unmatched).toBe(0);
      },
    );
  }
});
