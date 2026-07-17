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

describe('translation request validation', () => {
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
    });

    expect(result.translationStyle).toBe('meaning');
  });

  it('accepts only known translation styles', () => {
    const cinematic = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      translationStyle: 'cinematic',
    });
    expect(cinematic.translationStyle).toBe('cinematic');

    expect(() =>
      parseChunkTranslationRequest({
        chunk: 'subtitle',
        chunkIndex: 1,
        totalChunks: 1,
        movieInfo,
        translationStyle: 'literal',
      }),
    ).toThrow('Invalid translation style');
  });
});
