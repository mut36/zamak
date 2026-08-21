import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const openaiGenerateJson = vi.fn();
  const searchCandidates = vi.fn();
  const lookupById = vi.fn();
  return {
    generateContent,
    openaiGenerateJson,
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

vi.mock('../providers/openai', () => ({
  isOpenAiConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  openaiGenerateJson: mocks.openaiGenerateJson,
}));

vi.mock('./tmdb', async () => {
  const actual = await vi.importActual<typeof import('./tmdb')>('./tmdb');
  return {
    ...actual,
    searchCandidates: mocks.searchCandidates,
    lookupById: mocks.lookupById,
  };
});

import { extractCastSheet } from './extractCastSheet';

const originalGeminiKey = process.env.GOOGLE_GENAI_API_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalProvider = process.env.GLOSSARY_PROVIDER;

const movieInfo = { title: 'Test Movie', year: '2020' };

function jsonResponse(payload: unknown) {
  return { text: JSON.stringify(payload) };
}

const SUBTITLE = [
  '1\n00:00:01,000 --> 00:00:02,000\nJonathan, are you there?',
  '2\n00:00:03,000 --> 00:00:04,000\nYes, Elizabeth.',
].join('\n\n');

const VALID_SHEET = {
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
};

describe('extractCastSheet (gemini provider)', () => {
  beforeEach(() => {
    process.env.GLOSSARY_PROVIDER = 'gemini';
    process.env.GOOGLE_GENAI_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    mocks.generateContent.mockReset();
    mocks.openaiGenerateJson.mockReset();
    mocks.searchCandidates.mockReset();
    mocks.lookupById.mockReset();
    mocks.searchCandidates.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalGeminiKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalProvider === undefined) delete process.env.GLOSSARY_PROVIDER;
    else process.env.GLOSSARY_PROVIDER = originalProvider;
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
    mocks.generateContent.mockResolvedValue(jsonResponse(VALID_SHEET));

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

  it('라틴 문자 source는 단어 경계로 판정한다 (Al은 Always 안에서 안 걸린다)', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [
          { source: 'Al', target: '알', kind: 'person' },
          { source: 'Sam', target: '샘', kind: 'person' },
        ],
        relations: [],
      }),
    );

    const result = await extractCastSheet(
      '1\n00:00:01,000 --> 00:00:02,000\nAlways ask Sam.',
      movieInfo,
      'ko',
    );

    expect(result.terms.map((t) => t.source)).toEqual(['Sam']);
  });

  it('CJK source는 부분문자열 판정을 유지한다 (단어 경계가 없는 언어)', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [{ source: '조너선', target: '조너선', kind: 'person' }],
        relations: [],
      }),
    );

    const result = await extractCastSheet(
      '1\n00:00:01,000 --> 00:00:02,000\n조너선이었다.',
      movieInfo,
      'ko',
    );

    expect(result.terms).toHaveLength(1);
  });

  it('정규식 메타문자가 든 source도 터지지 않는다', async () => {
    mocks.generateContent.mockResolvedValue(
      jsonResponse({
        terms: [{ source: 'Dr. Who (M.D.)', target: '닥터 후', kind: 'person' }],
        relations: [],
      }),
    );

    const result = await extractCastSheet(
      '1\n00:00:01,000 --> 00:00:02,000\nDr. Who (M.D.) arrived.',
      movieInfo,
      'ko',
    );

    expect(result.terms).toHaveLength(1);
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

describe('extractCastSheet (openai provider)', () => {
  beforeEach(() => {
    process.env.GLOSSARY_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    delete process.env.GOOGLE_GENAI_API_KEY;
    mocks.generateContent.mockReset();
    mocks.openaiGenerateJson.mockReset();
    mocks.searchCandidates.mockReset();
    mocks.lookupById.mockReset();
    mocks.searchCandidates.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) delete process.env.GOOGLE_GENAI_API_KEY;
    else process.env.GOOGLE_GENAI_API_KEY = originalGeminiKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalProvider === undefined) delete process.env.GLOSSARY_PROVIDER;
    else process.env.GLOSSARY_PROVIDER = originalProvider;
  });

  it('returns an empty sheet with a warn when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(result).toEqual({ terms: [], relations: [] });
    expect(mocks.openaiGenerateJson).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OPENAI_API_KEY not configured'),
    );
    warn.mockRestore();
  });

  it('passes through valid terms and relations via openaiGenerateJson', async () => {
    mocks.openaiGenerateJson.mockResolvedValue({
      json: VALID_SHEET,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');

    expect(mocks.openaiGenerateJson).toHaveBeenCalledOnce();
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(result.terms).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
  });

  it('returns an empty sheet when openaiGenerateJson throws', async () => {
    mocks.openaiGenerateJson.mockRejectedValue(new Error('rate limited'));
    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result).toEqual({ terms: [], relations: [] });
  });

  it('still applies the hallucination filter on OpenAI output', async () => {
    mocks.openaiGenerateJson.mockResolvedValue({
      json: {
        terms: [
          { source: 'Jonathan', target: '조너선', kind: 'person', note: '' },
          { source: 'Made-Up Name', target: '지어낸이름', kind: 'person', note: '' },
        ],
        relations: [],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await extractCastSheet(SUBTITLE, movieInfo, 'ko');
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].source).toBe('Jonathan');
  });
});
