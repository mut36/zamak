import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  parseChunkTranslationRequest,
} from './requestValidation';
import { TARGET_LANGS } from '../../config/languages';
import { PRO_MODEL } from '../../config/constants';

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
        // 두 인물 모두 terms에 있어야 관계가 살아남는다 — 화자·청자는 terms의
        // person 항목이어야 한다는 규칙이 여기에도 걸리기 때문이다. 이 테스트가
        // 확인하려는 것은 옛 키(ko/존댓말)의 매핑이므로 인물만 채워 둔다.
        terms: [
          { source: 'Jonathan', ko: '조너선', kind: 'person' },
          { source: 'Elizabeth', ko: '엘리자베스', kind: 'person' },
        ],
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

  it('person이 아닌 term을 화자로 쓴 관계는 버린다 (사용자 편집본도 예외 없음)', () => {
    const result = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
      model: PRO_MODEL,
      castSheet: {
        terms: [
          { source: 'Blackwood Manor', target: '블랙우드 저택', kind: 'place' },
          { source: 'Jonathan', target: '조너선', kind: 'person' },
          { source: 'Elizabeth', target: '엘리자베스', kind: 'person' },
        ],
        relations: [
          { from: '블랙우드 저택', to: '조너선', speech: 'formal', fromBlock: 1, toBlock: 9 },
          { from: '조너선', to: '엘리자베스', speech: 'formal', fromBlock: 1, toBlock: 9 },
        ],
      },
    });

    expect(result.castSheet?.relations).toHaveLength(1);
    expect(result.castSheet?.relations[0].from).toBe('조너선');
  });

  it('terms에 아예 없는 이름을 쓴 관계도 버린다', () => {
    const result = parseChunkTranslationRequest({
      chunk: 'subtitle',
      chunkIndex: 1,
      totalChunks: 1,
      movieInfo,
      jobId,
      model: PRO_MODEL,
      castSheet: {
        terms: [{ source: 'Jonathan', target: '조너선', kind: 'person' }],
        relations: [
          { from: '조너선', to: '없는사람', speech: 'formal', fromBlock: 1, toBlock: 9 },
        ],
      },
    });

    expect(result.castSheet?.relations).toHaveLength(0);
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
