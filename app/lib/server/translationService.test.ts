import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  composeTranslationPrompt: vi.fn(),
  generateModelText: vi.fn(),
}));

vi.mock('../prompts/composer', () => ({
  composeTranslationPrompt: mocks.composeTranslationPrompt,
}));

// The mock stands for the model's TEXT; the usage envelope around it is the
// provider's business and nothing in this file asserts on it. Wrapping here
// rather than at every mockResolvedValue keeps these tests about alignment and
// error classification, which is what they exist to pin down.
vi.mock('../providers', () => ({
  generateModelText: async (...args: unknown[]) => ({
    text: await mocks.generateModelText(...args),
    usage: { prompt: 0, cached: 0, thoughts: 0, output: 0 },
    thinkingLevel: null,
  }),
  getModelProvider: () => ({ name: 'gemini' }),
}));

import { translateSubtitle } from './translationService';

const movieInfo = {
  title: '',
  genre: '',
  year: '',
  country: '',
  era: '',
  notes: '',
};

const sourceContent = [
  '1',
  '00:00:01,000 --> 00:00:02,000',
  'Hello',
  '',
  '2',
  '00:00:03,000 --> 00:00:04,000',
  'World',
].join('\n');

const strictSetting = process.env.TRANSLATION_STRICT_MODE;

function restoreStrict() {
  if (strictSetting === undefined) {
    delete process.env.TRANSLATION_STRICT_MODE;
    return;
  }
  process.env.TRANSLATION_STRICT_MODE = strictSetting;
}

async function translate() {
  return translateSubtitle({
    model: 'gemini-3.6-flash',
    movieInfo,
    targetLanguage: 'ko',
    translationMode: 'chunk',
    translationStyle: 'meaning',
    subtitleContent: sourceContent,
  });
}

async function translateContent(): Promise<string> {
  return (await translate()).content;
}

describe('translateSubtitle strict mode (opt-in validation)', () => {
  beforeEach(() => {
    // Strict mode is off by default; these tests cover the opt-in path.
    process.env.TRANSLATION_STRICT_MODE = 'true';
    mocks.composeTranslationPrompt.mockResolvedValue('prompt');
    mocks.generateModelText.mockReset();
  });

  afterEach(restoreStrict);

  it('returns valid translated SRT', async () => {
    const translatedContent = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n');
    mocks.generateModelText.mockResolvedValue(translatedContent);

    await expect(translateContent()).resolves.toBe(translatedContent);
  });

  it('rejects an empty AI response', async () => {
    mocks.generateModelText.mockResolvedValue('');

    await expect(translate()).rejects.toThrow('AI가 빈 번역 결과를 반환했습니다');
  });

  it('rejects unmappable output in default (non-strict) mode', async () => {
    delete process.env.TRANSLATION_STRICT_MODE;
    mocks.generateModelText.mockResolvedValue('형식을 무시하고 뱉은 산문');

    await expect(translate()).rejects.toThrow('자막 형식으로 복원하지 못했습니다');
    expect(mocks.generateModelText).toHaveBeenCalledTimes(1);
  });

  it('retries and splits a translated SRT with missing blocks', async () => {
    const missingBlockResult = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
    ].join('\n');
    mocks.generateModelText
      .mockResolvedValueOnce(missingBlockResult)
      .mockResolvedValueOnce(missingBlockResult)
      .mockResolvedValueOnce(missingBlockResult)
      .mockResolvedValueOnce([
        '1',
        '00:00:01,000 --> 00:00:02,000',
        '안녕',
      ].join('\n'))
      .mockResolvedValueOnce([
        '2',
        '00:00:03,000 --> 00:00:04,000',
        '세계',
      ].join('\n'));

    await expect(translateContent()).resolves.toBe([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));
    expect(mocks.generateModelText).toHaveBeenCalledTimes(5);
  });

  it('repairs blocks when Gemini omits blank lines between SRT blocks', async () => {
    mocks.generateModelText.mockResolvedValue([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));

    await expect(translateContent()).resolves.toBe([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));
  });

  it('ignores non-SRT text wrapped around otherwise complete subtitles', async () => {
    mocks.generateModelText.mockResolvedValue([
      '번역 결과입니다.',
      '',
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));

    await expect(translateContent()).resolves.toBe([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));
    expect(mocks.generateModelText).toHaveBeenCalledTimes(1);
  });

  it('repairs changed subtitle numbers and timestamps', async () => {
    mocks.generateModelText.mockResolvedValue([
      '99',
      '00:00:01,500 --> 00:00:02,500',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));

    await expect(translateContent()).resolves.toBe([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));
  });

  it('repairs blocks that contain only translated text', async () => {
    mocks.generateModelText.mockResolvedValue([
      '안녕',
      '',
      '세계',
    ].join('\n'));

    await expect(translateContent()).resolves.toBe([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '안녕',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));
  });

  it('includes block diagnostics for empty translated blocks', async () => {
    mocks.generateModelText.mockResolvedValue([
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      '세계',
    ].join('\n'));

    await expect(translate()).rejects.toThrow('결과=');
  });
});

describe('translateSubtitle default mode (single call, no cost bomb)', () => {
  beforeEach(() => {
    delete process.env.TRANSLATION_STRICT_MODE;
    mocks.composeTranslationPrompt.mockResolvedValue('prompt');
    mocks.generateModelText.mockReset();
  });

  afterEach(restoreStrict);

  it('restores source timecodes onto the timestamp-free model output', async () => {
    // The model never receives timestamps, so it returns a [N] marker + text.
    mocks.generateModelText.mockResolvedValue(
      ['[1] 안녕', '', '[2] 세계'].join('\n'),
    );

    await expect(translateContent()).resolves.toBe(
      [
        '1',
        '00:00:01,000 --> 00:00:02,000',
        '안녕',
        '',
        '2',
        '00:00:03,000 --> 00:00:04,000',
        '세계',
      ].join('\n'),
    );
  });

  it('keeps one call on a block-count mismatch and falls back per block', async () => {
    // The old cost bomb: a mismatch here would trigger per-block re-translation.
    // Now the block the model skipped just keeps its original text, and block 2
    // still gets block 2's timecode — no shifting.
    mocks.generateModelText.mockResolvedValue('[1] 안녕');

    await expect(translateContent()).resolves.toBe(
      [
        '1',
        '00:00:01,000 --> 00:00:02,000',
        '안녕',
        '',
        '2',
        '00:00:03,000 --> 00:00:04,000',
        'World',
      ].join('\n'),
    );
    expect(mocks.generateModelText).toHaveBeenCalledTimes(1);
  });

  it('reports the skipped block as unmatched for the caller to surface', async () => {
    mocks.generateModelText.mockResolvedValue('[1] 안녕');

    await expect(translate()).resolves.toMatchObject({ unmatchedBlocks: 1 });
  });

  it('does not retry — a failed call throws after exactly one attempt', async () => {
    mocks.generateModelText.mockRejectedValue(new Error('boom'));

    await expect(translate()).rejects.toThrow();
    expect(mocks.generateModelText).toHaveBeenCalledTimes(1);
  });

  it('tags a quota error so the caller can classify it without message-sniffing', async () => {
    mocks.generateModelText.mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(translate()).rejects.toMatchObject({ code: 'quota' });
  });

  it('tags an alignment failure distinctly from a raw call failure', async () => {
    mocks.generateModelText.mockResolvedValue('형식을 무시하고 뱉은 산문');

    await expect(translate()).rejects.toMatchObject({ code: 'align' });
  });
});
