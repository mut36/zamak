import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const searchCandidates = vi.fn();
  const lookupById = vi.fn();
  return {
    generateContent,
    searchCandidates,
    lookupById,
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
    searchCandidates: mocks.searchCandidates,
    lookupById: mocks.lookupById,
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
    mocks.searchCandidates.mockReset();
    mocks.lookupById.mockReset();
    mocks.searchCandidates.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalApiKey;
  });

  it('returns an empty sheet without calling the model when no API key is configured', async () => {
    delete process.env.GOOGLE_GENAI_API_KEY;
    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result).toEqual({ terms: [], relations: [] });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('returns an empty sheet for empty subtitle content, without calling the model', async () => {
    const result = await extractCastSheet('', movieInfo, 'ko');
    expect(result).toEqual({ terms: [], relations: [] });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('passes through valid terms and relations', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Jonathan', target: '조너선', kind: 'person', note: '주인공' },
          { source: 'Elizabeth', target: '엘리자베스', kind: 'person' },
        ],
        relations: [
          {
            from: '조너선',
            to: '엘리자베스',
            speech: 'formal',
            basis: '초면',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(result.terms).toEqual([
      { source: 'Jonathan', target: '조너선', kind: 'person', note: '주인공' },
      { source: 'Elizabeth', target: '엘리자베스', kind: 'person' },
    ]);
    expect(result.relations).toEqual([
      {
        from: '조너선',
        to: '엘리자베스',
        speech: 'formal',
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
          { source: 'Jonathan', target: '조너선', kind: 'person' },
          { source: 'Made-Up Name', target: '지어낸이름', kind: 'person' },
        ],
        relations: [],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].source).toBe('Jonathan');
  });

  it('drops a relation referencing a target name that is not in the surviving terms', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [{ source: 'Jonathan', target: '조너선', kind: 'person' }],
        relations: [
          {
            from: '조너선',
            to: '유령인물',
            speech: 'informal',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result.relations).toEqual([]);
  });

  it('clamps out-of-range block numbers into [1, blockCount]', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Jonathan', target: '조너선', kind: 'person' },
          { source: 'Elizabeth', target: '엘리자베스', kind: 'person' },
        ],
        relations: [
          {
            from: '조너선',
            to: '엘리자베스',
            speech: 'formal',
            fromBlock: -5,
            toBlock: 999,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result.relations[0]).toMatchObject({ fromBlock: 1, toBlock: 2 });
  });

  it('returns an empty sheet when the model response is not parseable JSON', async () => {
    mocks.generateContent.mockResolvedValue({ text: 'not json at all' });
    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result).toEqual({ terms: [], relations: [] });
  });

  it('includes a <tmdb_cast> anchor tag (character + actor, not a target-language spelling) when TMDB has a match', async () => {
    mocks.searchCandidates.mockResolvedValue([
      { mediaType: 'movie', tmdbId: 1, title: 'Test Movie', year: '2020', overview: '', posterUrl: null },
    ]);
    mocks.lookupById.mockResolvedValue({
      found: true,
      cast: [{ character: 'Jonathan', actor: 'John Smith' }],
    });
    mocks.generateContent.mockResolvedValue(
      jsonResponse({ terms: [], relations: [] }),
    );

    await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(mocks.searchCandidates).toHaveBeenCalledWith('Test Movie', '2020');
    expect(mocks.lookupById).toHaveBeenCalledWith('movie', 1);
    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.contents).toContain(
      '<tmdb_cast>\n- Jonathan (배우: John Smith)\n</tmdb_cast>',
    );
  });

  it('omits the <tmdb_cast> tag when TMDB has no match', async () => {
    mocks.searchCandidates.mockResolvedValue([]);
    mocks.generateContent.mockResolvedValue(
      jsonResponse({ terms: [], relations: [] }),
    );

    await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(mocks.lookupById).not.toHaveBeenCalled();
    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.contents).not.toContain('<tmdb_cast>');
  });

  it('asks for the target language’s own formality axis, and for none at all when the language has no axis', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({ terms: [], relations: [] }),
    );

    await extractCastSheet(SUBTITLE, movieInfo, 'ja');
    const ja = mocks.generateContent.mock.calls[0][0].config.systemInstruction;
    expect(ja).not.toContain('{{');
    expect(ja).toContain('일본어 표기(target)');
    expect(ja).toContain('敬語(です・ます体)');

    await extractCastSheet(SUBTITLE, movieInfo, 'en');
    const en = mocks.generateContent.mock.calls[1][0].config.systemInstruction;
    expect(en).not.toContain('{{');
    expect(en).toContain('문법적 말투 축이 없다');
    expect(en).not.toContain('敬語');
  });

  it('drops relations the model returned anyway for an axis-less language', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [{ source: 'Jonathan', target: 'Jonathan', kind: 'person' }],
        relations: [
          {
            from: 'Jonathan',
            to: 'Jonathan',
            speech: 'formal',
            fromBlock: 1,
            toBlock: 2,
          },
        ],
      }),
    );

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'en');
    expect(result.terms).toHaveLength(1);
    expect(result.relations).toEqual([]);
  });

  it('returns an empty sheet when the model call throws', async () => {
    mocks.generateContent.mockRejectedValue(new Error('quota exceeded'));
    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result).toEqual({ terms: [], relations: [] });
  });
});
