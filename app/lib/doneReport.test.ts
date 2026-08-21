import { describe, it, expect } from 'vitest';
import { buildReport } from './doneReport';
import type { TranslationResult } from '../types/translation';
import type { MovieInfo } from '../types/translation';

const result: TranslationResult = {
  content: '',
  filename: 'x.ko.srt',
  downloads: [],
  lineCount: 1204,
  durationMs: 30_000,
  fallbackBlocks: 0,
};

const bareInfo: MovieInfo = { title: '', year: '', notes: '' };

describe('buildReport', () => {
  it('always reports the verified timecode count and leftover originals', () => {
    const items = buildReport(result, { movieInfo: bareInfo });
    const timecode = items.find((i) => i.key === 'timecode');
    expect(timecode?.params).toEqual({ lines: 1204, fallback: 0 });
  });

  it('reports era and tone only when enrich actually filled them', () => {
    expect(buildReport(result, { movieInfo: bareInfo }).some((i) => i.key === 'context')).toBe(
      false,
    );
    const withEra = buildReport(result, {
      movieInfo: { ...bareInfo, era: '1920년대 아일랜드 해안' },
    });
    expect(withEra.some((i) => i.key === 'context')).toBe(true);
  });

  it('reports glossary counts only when a sheet was used', () => {
    const noSheet = buildReport(result, { movieInfo: bareInfo });
    expect(noSheet.some((i) => i.key === 'glossary')).toBe(false);

    const withSheet = buildReport(result, {
      movieInfo: bareInfo,
      castSheet: {
        terms: [
          { source: 'Thomas', target: '토마스', kind: 'person' },
          { source: 'Keeper', target: '등대지기', kind: 'term' },
        ],
        relations: [
          { from: '핀', to: '토마스', speech: 'formal', fromBlock: 1, toBlock: 1204 },
        ],
        narration: 'none',
      },
    });
    expect(withSheet.find((i) => i.key === 'glossary')?.params).toEqual({ terms: 2 });
    expect(withSheet.find((i) => i.key === 'relations')?.params).toEqual({ pairs: 1 });
  });

  it('never invents a metric we do not measure', () => {
    // The prototype showed a "CPS 조정 23곳" line. We do not count that, so it
    // must not appear — a report the user cannot trust is worse than a short one.
    const keys = buildReport(result, { movieInfo: bareInfo }).map((i) => i.key);
    expect(keys).not.toContain('cps');
  });
});
