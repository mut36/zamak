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

import { enrichFromTmdb, enrichMovie, enrichWithGrounding } from './enrichMovie';

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

  it('treats a TMDB lookup failure the same as a miss (returns null)', async () => {
    mocks.lookupTitle.mockRejectedValue(new Error('TMDB request failed: 500'));

    const result = await enrichFromTmdb('괴물', '2006');

    expect(result).toBeNull();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});

describe('enrichWithGrounding', () => {
  beforeEach(() => {
    process.env.GOOGLE_GENAI_API_KEY = 'test-key';
    mocks.generateContent.mockReset();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalApiKey;
  });

  it('parses a confirmed movie into the unified shape, with no poster', async () => {
    mocks.generateContent.mockResolvedValue(
      textResponse(
        [
          '영화여부: 영화',
          '제목: 어떤 마이너 영화',
          '연도: 1987',
          '감독: 김감독',
          '장르: 드라마, 시대극',
          '배경/시대: 1980년대 지방 소도시',
          '톤앤매너: 담담, 애수',
        ].join('\n'),
      ),
    );

    const result = await enrichWithGrounding('어떤 마이너 영화', '1987');

    expect(result).toEqual({
      found: true,
      title: '어떤 마이너 영화',
      year: '1987',
      director: '김감독',
      posterUrl: null,
      genre: '드라마, 시대극',
      era: '1980년대 지방 소도시',
      tone: '담담, 애수',
    });
    // Grounding is what distinguishes this call from the non-grounded
    // keyword-extraction call in enrichFromTmdb.
    expect(mocks.generateContent.mock.calls[0][0].config.tools).toEqual([
      { googleSearch: {} },
    ]);
  });

  it('returns null when the search cannot confirm a movie/drama', async () => {
    mocks.generateContent.mockResolvedValue(textResponse('영화여부: 없음'));

    const result = await enrichWithGrounding('random gibberish filename', '');

    expect(result).toBeNull();
  });

  it('falls back to the input year when the model omits an unparseable year', async () => {
    mocks.generateContent.mockResolvedValue(
      textResponse('영화여부: 영화\n제목: 어떤 영화\n연도: 알수없음'),
    );

    const result = await enrichWithGrounding('어떤 영화', '1999');

    expect(result?.year).toBe('1999');
  });

  it('returns null without calling the model when no API key is configured', async () => {
    delete process.env.GOOGLE_GENAI_API_KEY;

    const result = await enrichWithGrounding('어떤 영화', '1999');

    expect(result).toBeNull();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('returns null when the grounded call throws', async () => {
    mocks.generateContent.mockRejectedValue(new Error('quota exceeded'));

    const result = await enrichWithGrounding('어떤 영화', '1999');

    expect(result).toBeNull();
  });
});

describe('enrichMovie', () => {
  beforeEach(() => {
    process.env.GOOGLE_GENAI_API_KEY = 'test-key';
    mocks.lookupTitle.mockReset();
    mocks.generateContent.mockReset();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalApiKey;
  });

  it('returns the TMDB result and never calls grounded search when TMDB has a match', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      title: '괴물',
      year: '2006',
      director: '봉준호',
      genres: ['SF'],
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    });
    mocks.generateContent.mockResolvedValue(
      textResponse('배경/시대: 2000년대 한강\n톤앤매너: 긴박'),
    );

    const result = await enrichMovie('괴물', '2006');

    expect(result?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    // Exactly one call (the non-grounded keyword extraction) — no
    // googleSearch-tooled call was made.
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    expect(mocks.generateContent.mock.calls[0][0].config.tools).toBeUndefined();
  });

  it('falls back to grounded search when TMDB has no match', async () => {
    mocks.lookupTitle.mockResolvedValue({ found: false });
    mocks.generateContent.mockResolvedValue(
      textResponse(
        '영화여부: 영화\n제목: 마이너 영화\n연도: 2010\n감독: 이감독\n장르: 코미디\n배경/시대: 현대 서울\n톤앤매너: 유쾌',
      ),
    );

    const result = await enrichMovie('마이너 영화', '2010');

    expect(result).toEqual({
      found: true,
      title: '마이너 영화',
      year: '2010',
      director: '이감독',
      posterUrl: null,
      genre: '코미디',
      era: '현대 서울',
      tone: '유쾌',
    });
  });

  it('returns null when neither TMDB nor grounded search can identify the work', async () => {
    mocks.lookupTitle.mockResolvedValue({ found: false });
    mocks.generateContent.mockResolvedValue(textResponse('영화여부: 없음'));

    const result = await enrichMovie('완전히 알 수 없는 파일', '');

    expect(result).toBeNull();
  });
});
