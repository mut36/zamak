import { describe, it, expect } from 'vitest';
import { countBlocks, exceedsCreditCap } from './useWizard';
import { MAX_BLOCKS_PER_CREDIT } from '../config/constants';

/** N blocks of valid SRT, so countBlocks parses rather than guesses. */
function srtWithBlocks(n: number): string {
  return Array.from({ length: n }, (_, i) => {
    const s = String(i).padStart(2, '0');
    return `${i + 1}\n00:00:${s},000 --> 00:00:${s},500\n대사 ${i + 1}`;
  }).join('\n\n');
}

describe('upload-time credit-cap guard', () => {
  // The guard exists because /api/translation/begin's cap check runs too late:
  // by then the settings screen has already paid for enrich, summarize and a
  // glossary extraction on a file we are about to refuse.
  it('allows a file of exactly MAX_BLOCKS_PER_CREDIT blocks', () => {
    // The server uses `> MAX_BLOCKS_PER_CREDIT`. Off-by-one here would reject
    // a file the server would happily translate.
    expect(exceedsCreditCap(MAX_BLOCKS_PER_CREDIT)).toBe(false);
  });

  it('rejects one block past the cap', () => {
    expect(exceedsCreditCap(MAX_BLOCKS_PER_CREDIT + 1)).toBe(true);
  });

  it('counts blocks the way the server does', () => {
    // useTranslation sends parseSrtBlocks(doc.srt).length to the begin route.
    // If this ever counted cues or lines instead, the client and server would
    // disagree about which files are too large.
    expect(countBlocks(srtWithBlocks(3))).toBe(3);
    expect(countBlocks('')).toBe(0);
  });
});

// runEnrich's auto-pick-first-candidate behavior (ambiguous search → resolve
// candidates[0] → same confirm banner as a confident match, full list only
// on "이 작품이 아니에요") lives in useWizard.ts and depends on the async
// /api/enrich round-trip, so it isn't covered by a pure-function test here —
// see runEnrich's doc comment for the routing rules it implements.
