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

  it('대사를 고치지 말라고 말한다 — 번역 지시는 없다', async () => {
    const prompt = await composeLineSplitPrompt('ko');
    // 2026-08-26 사고 뒤 문구를 "번역하지 마"에서 "한 글자도 바꾸지 마"로
    // 넓혔다. 번역만 막으면 압축·다듬기가 남고, 그것도 코드가 되돌린다
    // (`verbatimGuard.ts`) — 프롬프트와 코드가 같은 말을 해야 한다.
    expect(prompt).toContain('한 글자도 바꾸지 마');
    expect(prompt).toContain('번역');
    expect(prompt).not.toContain('존댓말');
  });

  it('이탈리아어도 같은 금지를 담는다', async () => {
    const prompt = await composeLineSplitPrompt('it');
    expect(prompt).toContain('42');
    expect(prompt).toContain('Non cambiare nemmeno un carattere');
  });

  it('활성화되지 않은 도착어는 던진다', async () => {
    await expect(composeLineSplitPrompt('xx')).rejects.toThrow(
      'Unsupported target language: xx',
    );
  });
});
