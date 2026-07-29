import { describe, it, expect } from 'vitest';
import { isExpired } from './jobHistory';

describe('isExpired', () => {
  const created = '2026-07-01T00:00:00.000Z';

  it('keeps a result inside the retention window', () => {
    expect(isExpired(created, new Date('2026-07-20T00:00:00.000Z'), 30)).toBe(false);
  });

  it('expires a result past the retention window', () => {
    expect(isExpired(created, new Date('2026-08-05T00:00:00.000Z'), 30)).toBe(true);
  });

  it('treats the exact boundary as still available', () => {
    // A user who comes back on day 30 was promised 30 days, so the last day
    // counts as inside.
    expect(isExpired(created, new Date('2026-07-31T00:00:00.000Z'), 30)).toBe(false);
  });

  it('treats an unparseable timestamp as expired', () => {
    // Failing closed here shows "보관 기간이 지났어요" instead of handing out a
    // link that 404s.
    expect(isExpired('not-a-date', new Date('2026-07-02T00:00:00.000Z'), 30)).toBe(true);
  });
});
