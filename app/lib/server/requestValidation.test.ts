import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  parseChunkTranslationRequest,
} from './requestValidation';

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
