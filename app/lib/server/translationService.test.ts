import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  composeTranslationPrompt: vi.fn(),
  generateModelText: vi.fn(),
}));

vi.mock('../prompts/composer', () => ({
  composeTranslationPrompt: mocks.composeTranslationPrompt,
}));

vi.mock('../providers', () => ({
  generateModelText: mocks.generateModelText,
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

const outputValidationSetting = process.env.TRANSLATION_OUTPUT_VALIDATION;

async function translate() {
  return translateSubtitle({
    model: 'gemini-3.5-flash',
    movieInfo,
    targetLanguage: 'ko',
    translationMode: 'chunk',
    translationStyle: 'meaning',
    subtitleContent: sourceContent,
  });
}

describe('translateSubtitle output validation', () => {
  beforeEach(() => {
    delete process.env.TRANSLATION_OUTPUT_VALIDATION;
    mocks.composeTranslationPrompt.mockResolvedValue('prompt');
    mocks.generateModelText.mockReset();
  });

  afterEach(() => {
    if (outputValidationSetting === undefined) {
      delete process.env.TRANSLATION_OUTPUT_VALIDATION;
      return;
    }
    process.env.TRANSLATION_OUTPUT_VALIDATION = outputValidationSetting;
  });

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

    await expect(translate()).resolves.toBe(translatedContent);
  });

  it('rejects an empty AI response', async () => {
    mocks.generateModelText.mockResolvedValue('');

    await expect(translate()).rejects.toThrow('AI가 빈 번역 결과를 반환했습니다');
  });

  it('returns the model response unchanged when output validation is disabled', async () => {
    process.env.TRANSLATION_OUTPUT_VALIDATION = 'false';
    const untranslatedSrt = '모델이 반환한 형식 그대로';
    mocks.generateModelText.mockResolvedValue(untranslatedSrt);

    await expect(translate()).resolves.toBe(untranslatedSrt);
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

    await expect(translate()).resolves.toBe([
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

    await expect(translate()).resolves.toBe([
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

    await expect(translate()).resolves.toBe([
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

    await expect(translate()).resolves.toBe([
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

    await expect(translate()).resolves.toBe([
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
