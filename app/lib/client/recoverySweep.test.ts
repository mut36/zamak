import { describe, expect, it, vi } from 'vitest';
import { computeSweepBudget, runRecoverySweep } from './recoverySweep';
import { parseSrtBlocks, readBlockIndex } from '../srt';
import { TranslationError } from '../translationErrors';
import type { ChunkOutcome } from './chunkRetry';

/** `index` seconds into the film, one second long — valid SRT for any index
 * the tests use (a naive `00:00:${index}` breaks past 99). */
function timecode(index: number): string {
  const stamp = (seconds: number) =>
    `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60,
    ).padStart(2, '0')},000`;
  return `${stamp(index)} --> ${stamp(index + 1)}`;
}

function block(index: number, body: string): string {
  return `${index}\n${timecode(index)}\n${body}`;
}

/** A source file of `count` blocks, bodies "line 1".."line N". */
function sourceFile(count: number): string {
  return Array.from({ length: count }, (_, i) => block(i + 1, `line ${i + 1}`)).join(
    '\n\n',
  );
}

/**
 * Stands in for the server: translates every block it is handed, except the
 * sequence numbers in `skip`, which come back as unmatched (the model dropped
 * them) exactly as the real reassembly reports.
 */
function fakeTranslate(skip: ReadonlySet<number> = new Set()) {
  return vi.fn(async (chunk: string): Promise<ChunkOutcome> => {
    const unmatchedIndices: number[] = [];
    const content = parseSrtBlocks(chunk)
      .map((raw) => {
        const index = readBlockIndex(raw)!;
        if (skip.has(index)) {
          unmatchedIndices.push(index);
          return raw;
        }
        return block(index, `번역 ${index}`);
      })
      .join('\n\n');
    return {
      content,
      unmatchedBlocks: unmatchedIndices.length,
      unmatchedIndices,
    };
  });
}

const baseOptions = {
  chunkSize: 100,
  concurrency: 4,
  signal: new AbortController().signal,
  budget: 4,
};

describe('computeSweepBudget', () => {
  it('scales with the main pass but never drops below the floor', () => {
    expect(computeSweepBudget(1)).toBe(2); // floor
    expect(computeSweepBudget(20)).toBe(10);
  });
});

describe('runRecoverySweep', () => {
  it('repacks leftovers scattered across the file into a single call', async () => {
    const source = sourceFile(300);
    // Three stragglers 100 blocks apart — three separate chunks in the main
    // pass, but one dense chunk here. This is the whole point of the sweep.
    const translated = source;
    const translate = fakeTranslate();

    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: translated,
      leftover: [7, 150, 289],
      translate,
    });

    expect(translate).toHaveBeenCalledTimes(1);
    expect(result.calls).toBe(1);
    expect(result.recovered).toBe(3);
    expect(result.remaining).toEqual([]);
    expect(result.stoppedBy).toBe('clean');
  });

  it('substitutes recovered blocks in place and leaves the rest byte-identical', async () => {
    const source = sourceFile(5);
    // The main pass translated everything except block 3.
    const translated = [
      block(1, '번역 1'),
      block(2, '번역 2'),
      block(3, 'line 3'),
      block(4, '번역 4'),
      block(5, '번역 5'),
    ].join('\n\n');

    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: translated,
      leftover: [3],
      translate: fakeTranslate(),
    });

    expect(result.content).toBe(
      [
        block(1, '번역 1'),
        block(2, '번역 2'),
        block(3, '번역 3'),
        block(4, '번역 4'),
        block(5, '번역 5'),
      ].join('\n\n'),
    );
  });

  it('sends the source text, not the untranslated output, and keeps timecodes', async () => {
    const source = sourceFile(3);
    const translate = fakeTranslate();

    await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: source,
      leftover: [2],
      translate,
    });

    const sent = translate.mock.calls[0][0];
    expect(sent).toBe(block(2, 'line 2'));
    expect(sent).toContain(timecode(2));
  });

  it('picks up in a second round what the first round missed', async () => {
    const source = sourceFile(4);
    // Block 3 fails the first attempt and succeeds the second.
    const translate = vi
      .fn<(chunk: string) => Promise<ChunkOutcome>>()
      .mockImplementationOnce(fakeTranslate(new Set([3])))
      .mockImplementationOnce(fakeTranslate());

    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: source,
      leftover: [2, 3],
      translate,
    });

    expect(translate).toHaveBeenCalledTimes(2);
    expect(result.recovered).toBe(2);
    expect(result.remaining).toEqual([]);
  });

  it('stops the moment a round recovers nothing', async () => {
    const source = sourceFile(4);
    const translate = fakeTranslate(new Set([2, 3]));

    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: source,
      leftover: [2, 3],
      translate,
    });

    // Round 1 recovers nothing, so round 2 is never paid for.
    expect(translate).toHaveBeenCalledTimes(1);
    expect(result.stoppedBy).toBe('no-progress');
    expect(result.remaining).toEqual([2, 3]);
    expect(result.recovered).toBe(0);
  });

  it('never spends more calls than the budget allows', async () => {
    const source = sourceFile(10);
    // chunkSize 1 would want one call per leftover; the budget allows two.
    const translate = fakeTranslate();

    const result = await runRecoverySweep({
      ...baseOptions,
      chunkSize: 1,
      budget: 2,
      sourceContent: source,
      translatedContent: source,
      leftover: [1, 2, 3, 4, 5],
      translate,
    });

    expect(translate).toHaveBeenCalledTimes(2);
    expect(result.calls).toBe(2);
    expect(result.recovered).toBe(2);
    expect(result.stoppedBy).toBe('budget');
    expect(result.remaining).toEqual([3, 4, 5]);
  });

  it('drops blocks with nothing to translate instead of retrying them forever', async () => {
    const source = [block(1, '♪♪♪'), block(2, 'line 2'), block(3, '1999')].join(
      '\n\n',
    );
    const translate = fakeTranslate();

    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: source,
      translatedContent: source,
      leftover: [1, 2, 3],
      translate,
    });

    expect(result.untranslatable).toEqual([1, 3]);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toBe(block(2, 'line 2'));
    expect(result.recovered).toBe(1);
    expect(result.remaining).toEqual([]);
  });

  it('abandons the sweep on a fatal error rather than asking again', async () => {
    const source = sourceFile(4);
    const translate = vi
      .fn<(chunk: string) => Promise<ChunkOutcome>>()
      .mockRejectedValue(new TranslationError('over quota', 'quota'));

    const result = await runRecoverySweep({
      ...baseOptions,
      chunkSize: 1,
      sourceContent: source,
      translatedContent: source,
      leftover: [1, 2],
      translate,
    });

    expect(result.stoppedBy).toBe('fatal');
    expect(result.fatalCode).toBe('quota');
    expect(result.recovered).toBe(0);
    expect(result.remaining).toEqual([1, 2]);
  });

  it('leaves a failed chunk pending without failing the sweep', async () => {
    const source = sourceFile(4);
    const translate = vi
      .fn<(chunk: string) => Promise<ChunkOutcome>>()
      // Chunk order is deterministic (chunkSize 1, file order), so block 1
      // fails and block 2 succeeds.
      .mockRejectedValueOnce(new TranslationError('blip', 'transient'))
      .mockImplementation(fakeTranslate());

    const result = await runRecoverySweep({
      ...baseOptions,
      chunkSize: 1,
      concurrency: 1,
      sourceContent: source,
      translatedContent: source,
      leftover: [1, 2],
      translate,
    });

    expect(result.recovered).toBe(2); // 1 recovers on the second round
    expect(result.remaining).toEqual([]);
  });

  it('does nothing when the main pass left nothing behind', async () => {
    const translate = fakeTranslate();
    const result = await runRecoverySweep({
      ...baseOptions,
      sourceContent: sourceFile(3),
      translatedContent: sourceFile(3),
      leftover: [],
      translate,
    });

    expect(translate).not.toHaveBeenCalled();
    expect(result.stoppedBy).toBe('clean');
    expect(result.calls).toBe(0);
  });
});
