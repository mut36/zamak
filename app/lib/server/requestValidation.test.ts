import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  parseChunkTranslationRequest,
} from './requestValidation';
import { TARGET_LANGS } from '../../config/languages';

const movieInfo = {
  title: '',
  genre: '',
  year: '',
  country: '',
  era: '',
  notes: '',
};

const jobId = '00000000-0000-4000-8000-000000000000';

describe('translation request validation', () => {
  it('requires a job id, since that is the proof a credit was spent', () => {
    expect(() =>
      parseChunkTranslationRequest({
        chunk: 'subtitle',
        chunkIndex: 1,
        totalChunks: 1,
        movieInfo,
      }),
    ).toThrow('jobId');
  });

  it('rejects unsupported models instead of silently falling back', () => {
    expect(() =>
      parseChunkTranslationRequest({
        chunk: 'subtitle',
        chunkIndex: 1,
        totalChunks: 1,
        movieInfo,
        model: 'unknown-model',
      }),
    ).toThrow('Unsupported model');
  });

  it('validates chunk position', () => {
    expect(() =>
      parseChunkTranslationRequest({
        chunk: 'subtitle',
        chunkIndex: 3,
        totalChunks: 2,
        movieInfo,
      }),
    ).toThrow('Invalid chunk position');
  });

  it('accepts every enabled target language and rejects anything else', () => {
    const base = {
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
    };

    for (const lang of TARGET_LANGS.filter((l) => l.enabled)) {
      expect(
        parseChunkTranslationRequest({ ...base, targetLang: lang.code })
          .targetLang,
      ).toBe(lang.code);
    }

    // A scaffolded-but-disabled code has no rules file behind it, so it must
    // be refused here rather than reaching the prompt builder.
    expect(() =>
      parseChunkTranslationRequest({ ...base, targetLang: 'sv' }),
    ).toThrow('Unsupported target language');
    expect(parseChunkTranslationRequest(base).targetLang).toBe('ko');
  });

  it('maps a pre-multilingual client’s cast sheet instead of dropping it', () => {
    const result = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
      castSheet: {
        terms: [{ source: 'Jonathan', ko: '조너선', kind: 'person' }],
        relations: [
          {
            from: '조너선',
            to: '엘리자베스',
            speech: '존댓말',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      },
    });

    expect(result.castSheet?.terms[0]).toMatchObject({ target: '조너선' });
    expect(result.castSheet?.relations[0]).toMatchObject({ speech: 'formal' });
  });

  it('defaults to the current meaning-first style', () => {
    const result = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
    });

    expect(result.translationStyle).toBe('meaning');
    expect(result.jobId).toBe(jobId);
  });

  it('accepts only known translation styles', () => {
    const cinematic = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
      translationStyle: 'cinematic',
    });
    expect(cinematic.translationStyle).toBe('cinematic');

    expect(() =>
      parseChunkTranslationRequest({
        chunk: 'subtitle',
        chunkIndex: 1,
        totalChunks: 1,
        movieInfo,
        jobId,
        translationStyle: 'literal',
      }),
    ).toThrow('Invalid translation style');
  });
});
