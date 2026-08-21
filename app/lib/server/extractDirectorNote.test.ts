import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { sanitizeDirectorNote } from './extractDirectorNote';
import { DIRECTOR_NOTE_MAX_CHARS } from '../../config/constants';

describe('sanitizeDirectorNote', () => {
  it('note가 문자열이 아니면 빈 문자열', () => {
    expect(sanitizeDirectorNote(null)).toBe('');
    expect(sanitizeDirectorNote({})).toBe('');
    expect(sanitizeDirectorNote({ note: 42 })).toBe('');
  });

  it('글머리표와 인라인 마크다운을 걷어낸다 — 프롬프트가 금지했지만 자주 샌다', () => {
    expect(
      sanitizeDirectorNote({
        note: '- 가족 간의 대화는 전부 반말.\n* **내레이션**은 `~다` 체로.',
      }),
    ).toBe('가족 간의 대화는 전부 반말.\n내레이션은 ~다 체로.');
  });

  it('빈 줄을 접는다', () => {
    expect(sanitizeDirectorNote({ note: 'A\n\n\nB' })).toBe('A\nB');
  });

  it('캡을 넘으면 줄 단위로 버린다 — 문장이 중간에서 끊기면 틀린 지시가 된다', () => {
    const long = 'x'.repeat(DIRECTOR_NOTE_MAX_CHARS - 10);
    const note = sanitizeDirectorNote({
      note: `${long}\nAldo Moro → 알도 모로`,
    });
    expect(note).toBe(long);
    expect(note).not.toContain('알도 모');
  });

  it('첫 줄부터 캡을 넘으면 그때만 문자 단위로 자른다 — 전부 버리는 것보단 낫다', () => {
    const note = sanitizeDirectorNote({
      note: 'y'.repeat(DIRECTOR_NOTE_MAX_CHARS + 50),
    });
    expect(note).toHaveLength(DIRECTOR_NOTE_MAX_CHARS);
  });
});
