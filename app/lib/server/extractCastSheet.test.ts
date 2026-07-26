import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const lookupTitle = vi.fn();
  return {
    generateContent,
    lookupTitle,
    GoogleGenAI: vi.fn().mockImplementation(function GoogleGenAI(this: {
      models: { generateContent: typeof generateContent };
    }) {
      this.models = { generateContent };
    }),
  };
});

vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>(
    '@google/genai',
  );
  return {
    ...actual,
    GoogleGenAI: mocks.GoogleGenAI,
  };
});

vi.mock('./tmdb', async () => {
  const actual = await vi.importActual<typeof import('./tmdb')>('./tmdb');
  return {
    ...actual,
    lookupTitle: mocks.lookupTitle,
  };
});

import { extractCastSheet } from './extractCastSheet';

const originalApiKey = process.env.GOOGLE_GENAI_API_KEY;

const movieInfo = { title: 'Test Movie', year: '2020' };

function jsonResponse(payload: unknown) {
  return { text: JSON.stringify(payload) };
}

const SUBTITLE = [
  '1\n00:00:01,000 --> 00:00:02,000\nJonathan, are you there?',
  '2\n00:00:03,000 --> 00:00:04,000\nYes, Elizabeth.',
].join('\n\n');

describe('extractCastSheet', () => {
  beforeEach(() => {
    process.env.GOOGLE_GENAI_API_KEY = 'test-key';
    mocks.generateContent.mockReset();
    mocks.lookupTitle.mockReset();
    mocks.lookupTitle.mockResolvedValue({ found: false });
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalApiKey;
  });

  it('returns an empty sheet without calling the model when no API key is configured', async () => {
    delete process.env.GOOGLE_GENAI_API_KEY;
    const result = await extractCastSheet(SUBTITLE, movieInfo);
    expect(result).toEqual({ terms: [], relations: [] });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('returns an empty sheet for empty subtitle content, without calling the model', async () => {
    const result = await extractCastSheet('', movieInfo);
    expect(result).toEqual({ terms: [], relations: [] });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('passes through valid terms and relations', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Jonathan', ko: '조너선', kind: 'person', note: '주인공' },
          { source: 'Elizabeth', ko: '엘리자베스', kind: 'person' },
        ],
        relations: [
          {
            from: '조너선',
            to: '엘리자베스',
            speech: '존댓말',
            basis: '초면',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo);

    expect(result.terms).toEqual([
      { source: 'Jonathan', ko: '조너선', kind: 'person', note: '주인공' },
      { source: 'Elizabeth', ko: '엘리자베스', kind: 'person' },
    ]);
    expect(result.relations).toEqual([
      {
        from: '조너선',
        to: '엘리자베스',
        speech: '존댓말',
        basis: '초면',
        fromBlock: 1,
        toBlock: 2,
      },
    ]);
  });

  it('drops a term whose source string does not actually appear in the subtitles (hallucination filter)', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Jonathan', ko: '조너선', kind: 'person' },
          { source: 'Made-Up Name', ko: '지어낸이름', kind: 'person' },
        ],
        relations: [],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo);

    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].source).toBe('Jonathan');
  });

  it('drops a relation referencing a ko name that is not in the surviving terms', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [{ source: 'Jonathan', ko: '조너선', kind: 'person' }],
        relations: [
          {
            from: '조너선',
            to: '유령인물',
            speech: '반말',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo);
    expect(result.relations).toEqual([]);
  });

  it('clamps out-of-range block numbers into [1, blockCount]', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Jonathan', ko: '조너선', kind: 'person' },
          { source: 'Elizabeth', ko: '엘리자베스', kind: 'person' },
        ],
        relations: [
          {
            from: '조너선',
            to: '엘리자베스',
            speech: '존댓말',
            fromBlock: -5,
            toBlock: 999,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo);
    expect(result.relations[0]).toMatchObject({ fromBlock: 1, toBlock: 2 });
  });

  it('returns an empty sheet when the model response is not parseable JSON', async () => {
    mocks.generateContent.mockResolvedValue({ text: 'not json at all' });
    const result = await extractCastSheet(SUBTITLE, movieInfo);
    expect(result).toEqual({ terms: [], relations: [] });
  });

  it('includes a <tmdb_cast> anchor tag (character + actor, not a Korean spelling) when TMDB has a match', async () => {
    mocks.lookupTitle.mockResolvedValue({
      found: true,
      cast: [{ character: 'Jonathan', actor: 'John Smith' }],
    });
    mocks.generateContent.mockResolvedValue(
      jsonResponse({ terms: [], relations: [] }),
    );

    await extractCastSheet(SUBTITLE, movieInfo);

    expect(mocks.lookupTitle).toHaveBeenCalledWith('Test Movie', '2020');
    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.contents).toContain(
      '<tmdb_cast>\n- Jonathan (배우: John Smith)\n</tmdb_cast>',
    );
  });

  it('omits the <tmdb_cast> tag when TMDB has no match', async () => {
    mocks.lookupTitle.mockResolvedValue({ found: false });
    mocks.generateContent.mockResolvedValue(
      jsonResponse({ terms: [], relations: [] }),
    );

    await extractCastSheet(SUBTITLE, movieInfo);

    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.contents).not.toContain('<tmdb_cast>');
  });

  it('returns an empty sheet when the model call throws', async () => {
    mocks.generateContent.mockRejectedValue(new Error('quota exceeded'));
    const result = await extractCastSheet(SUBTITLE, movieInfo);
    expect(result).toEqual({ terms: [], relations: [] });
  });
});
