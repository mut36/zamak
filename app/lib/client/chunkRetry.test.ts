import { describe, expect, it, vi } from 'vitest';
import { translateChunkWithRetry, type RetryState } from './chunkRetry';
import { TranslationError } from '../translationErrors';

function freshState(budget = 3): RetryState {
  return { budget, fatalCode: null };
}

const singleBlockChunk = ['1', '00:00:01,000 --> 00:00:02,000', 'Hello'].join(
  '\n',
);
const twoBlockChunk = [
  '1',
  '00:00:01,000 --> 00:00:02,000',
  'Hello',
  '',
  '2',
  '00:00:03,000 --> 00:00:04,000',
  'World',
].join('\n');

describe('translateChunkWithRetry', () => {
  it('returns the result unchanged on first-try success, spending no budget', async () => {
    const translate = vi.fn().mockResolvedValue({ content: 'ok', unmatchedBlocks: 0 });
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).resolves.toEqual({ content: 'ok', unmatchedBlocks: 0 });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(state.budget).toBe(3);
  });

  it('retries a transient error once and succeeds, spending one budget unit', async () => {
    const translate = vi
      .fn()
      .mockRejectedValueOnce(new TranslationError('blip', 'transient'))
      .mockResolvedValueOnce({ content: 'ok', unmatchedBlocks: 0 });
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).resolves.toEqual({ content: 'ok', unmatchedBlocks: 0 });
    expect(translate).toHaveBeenCalledTimes(2);
    expect(state.budget).toBe(2);
  });

  it('retries an alignment miss once, and re-throws if it fails again', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationError('no match', 'align'));
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'align' });
    expect(translate).toHaveBeenCalledTimes(2);
    expect(state.budget).toBe(2);
  });

  it('does not retry once the shared budget is exhausted', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationError('blip', 'transient'));
    const state = freshState(0);

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'transient' });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(state.budget).toBe(0);
  });

  it('does not retry a safety block — retrying would just repeat it', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationError('blocked', 'safety'));
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'safety' });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(state.budget).toBe(3);
  });

  it('splits an oversize chunk in half and stitches the two results', async () => {
    const translate = vi
      .fn()
      .mockRejectedValueOnce(new TranslationError('too big', 'oversize'))
      .mockResolvedValueOnce({ content: 'first-half', unmatchedBlocks: 0 })
      .mockResolvedValueOnce({ content: 'second-half', unmatchedBlocks: 1 });
    const state = freshState();

    await expect(
      translateChunkWithRetry(twoBlockChunk, new AbortController().signal, translate, state),
    ).resolves.toEqual({
      content: 'first-half\n\nsecond-half',
      unmatchedBlocks: 1,
    });
    expect(translate).toHaveBeenCalledTimes(3);
    expect(state.budget).toBe(2);
  });

  it('falls back on the original oversize error when a single-block chunk cannot be split', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationError('too big', 'oversize'));
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'oversize' });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(state.budget).toBe(3);
  });

  it('falls back on the original error when the split halves also fail', async () => {
    const translate = vi
      .fn()
      .mockRejectedValueOnce(new TranslationError('too big', 'oversize'))
      .mockRejectedValue(new TranslationError('still too big', 'oversize'));
    const state = freshState();

    await expect(
      translateChunkWithRetry(twoBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ message: 'too big', code: 'oversize' });
  });

  it('marks the shared state fatal on quota and re-throws', async () => {
    const translate = vi
      .fn()
      .mockRejectedValue(new TranslationError('limit hit', 'quota'));
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'quota' });
    expect(state.fatalCode).toBe('quota');
  });

  it('skips the network call entirely once the state is already fatal', async () => {
    const translate = vi.fn();
    const state: RetryState = { budget: 3, fatalCode: 'auth' };

    await expect(
      translateChunkWithRetry(singleBlockChunk, new AbortController().signal, translate, state),
    ).rejects.toMatchObject({ code: 'auth' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('never retries a genuine user cancellation', async () => {
    const controller = new AbortController();
    const translate = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });
    const state = freshState();

    await expect(
      translateChunkWithRetry(singleBlockChunk, controller.signal, translate, state),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(translate).toHaveBeenCalledTimes(1);
    expect(state.budget).toBe(3);
  });
});
