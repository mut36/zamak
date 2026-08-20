import { describe, expect, it, vi } from 'vitest';

// loader.ts는 `import 'server-only'`를 달고 있다 — composer.test.ts와 같은 방식으로
// 벗겨낸다. 프롬프트 조합 자체는 서버 전용 API를 안 쓰므로 노드에서 그대로 돈다.
vi.mock('server-only', () => ({}));

import { composeLineSplitPrompt } from './lineSplit';

describe('composeLineSplitPrompt', () => {
  it('한국어의 lineMaxChars(18)를 렌더한다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).toContain('18자');
  });

  it('렌더되지 않은 자리표시자를 남기지 않는다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).not.toContain('{{');
  });

  it('번역 지시를 담지 않는다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    expect(prompt).toContain('번역하지 마');
    expect(prompt).not.toContain('존댓말');
  });

  it('활성화되지 않은 도착어는 던진다', async () => {
    await expect(composeLineSplitPrompt('xx')).rejects.toThrow(
      'Unsupported target language: xx',
    );
  });
});
