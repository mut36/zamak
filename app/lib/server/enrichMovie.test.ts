import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  return {
    lookupTitle: vi.fn(),
    generateContent,
    GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: {
      models: { generateContent: typeof generateContent };
    }) {
      this.models = { generateContent };
    }),
  };
});

vi.mock('./tmdb', () => ({
  lookupTitle: mocks.lookupTitle,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: mocks.GoogleGenAI,
}));

import { enrichFromTmdb } from './enrichMovie';

const originalApiKey = process.env.GOOGLE_GENAI_API_KEY;

function textResponse(text: string) {
  return { text };
}

describe('enrichFromTmdb', () => {
  beforeEach(() => {
    process.env.GOOGLE_GENAI_API_KEY = 'test-key';
    mocks.lookupTitle.mockReset();
    mocks.generateContent.mockReset();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalApiKey;
  });

  it('returns null when TMDB has no match, without calling the aux model', async () => {
    mocks.lookupTitle.mockResolvedValue({ found: false });

    const result = await enrichFromTmdb('Some Obscure Title', '2020');

    expect(result).toBeNull();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('keeps the TMDB Korean title as-is and ignores any title line from the aux model', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      genres: ['SF', '스릴러'],
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    });
    mocks.generateContent.mockResolvedValue(
      textResponse(
        '배경/시대: 2000년대 한강, 도시\n톤앤매너: 긴박, 블랙코미디\n한국어제목: 몬스터',
      ),
    );

    const result = await enrichFromTmdb('괴물', '2006');

    expect(result).toEqual({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      genre: 'SF, 스릴러',
      era: '2000년대 한강, 도시',
      tone: '긴박, 블랙코미디',
    });
    // Requesting a transliteration line would only be needed for a
    // non-Hangul TMDB title.
    expect(mocks.generateContent.mock.calls[0][0].contents).not.toContain(
      '한국어제목:',
    );
  });

  it('uses the aux model transliteration when TMDB has no Korean title', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: 'Amélie',
      year: '2001',
      director: 'Jean-Pierre Jeunet',
      genres: ['로맨스'],
      posterUrl: null,
    });
    mocks.generateContent.mockResolvedValue(
      textResponse(
        '배경/시대: 1990년대 파리\n톤앤매너: 아기자기, 동화적\n한국어제목: 아멜리에',
      ),
    );

    const result = await enrichFromTmdb('Amelie', '2001');

    expect(result?.title).toBe('아멜리에');
    expect(mocks.generateContent.mock.calls[0][0].contents).toContain(
      '한국어제목:',
    );
  });

  it('still returns TMDB fields when the aux call fails, with empty era/tone', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      genres: ['SF'],
      posterUrl: null,
    });
    mocks.generateContent.mockRejectedValue(new Error('quota exceeded'));

    const result = await enrichFromTmdb('괴물', '2006');

    expect(result).toEqual({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      posterUrl: null,
      genre: 'SF',
      era: '',
      tone: '',
    });
  });

  it('skips the aux call and returns empty era/tone when no API key is configured', async () => {
    delete process.env.GOOGLE_GENAI_API_KEY;
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      genres: [],
      posterUrl: null,
    });

    const result = await enrichFromTmdb('괴물', '2006');

    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(result).toEqual({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      posterUrl: null,
      genre: '',
      era: '',
      tone: '',
    });
  });

  it('falls back to the input year when TMDB has no parseable date', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: '괴물',
      year: '',
      director: null,
      genres: [],
      posterUrl: null,
    });
    mocks.generateContent.mockResolvedValue(textResponse(''));

    const result = await enrichFromTmdb('괴물', '2006');

    expect(result?.year).toBe('2006');
  });
});
