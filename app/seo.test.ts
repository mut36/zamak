import { describe, expect, it } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';
import { SITE } from './lib/brand';

/**
 * These two files decide what a stranger can find. The invariant worth pinning
 * is not their exact contents — it is that the private surfaces stay out of the
 * sitemap and stay in the disallow list, because both are hand-maintained lists
 * that a future page can silently fall on the wrong side of.
 */

/** Every path that must never be advertised or crawled. */
const PRIVATE_PREFIXES = ['/api', '/auth', '/mypage', '/dev'];

describe('sitemap', () => {
  const entries = sitemap();

  it('lists only the public pages', () => {
    expect(entries.map((e) => new URL(e.url).pathname).sort()).toEqual([
      '/',
      '/legal',
      '/legal/privacy',
    ]);
  });

  it('advertises no session-gated or internal route', () => {
    for (const entry of entries) {
      const { pathname } = new URL(entry.url);
      for (const prefix of PRIVATE_PREFIXES) {
        expect(pathname.startsWith(prefix)).toBe(false);
      }
    }
  });

  it('emits absolute URLs on one origin', () => {
    const origins = new Set(entries.map((e) => new URL(e.url).origin));
    expect(origins.size).toBe(1);
  });

  it('claims no lastModified it cannot support', () => {
    // A `new Date()` stamp here would tell crawlers all three pages change on
    // every deploy, which is false. See the note in sitemap.ts.
    expect(entries.every((e) => e.lastModified === undefined)).toBe(true);
  });
});

describe('robots', () => {
  const rules = robots();

  it('disallows every private prefix', () => {
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules;
    const disallow = [rule?.disallow ?? []].flat();

    for (const prefix of PRIVATE_PREFIXES) {
      expect(
        disallow.some((path) => path.startsWith(prefix)),
        `${prefix} must be disallowed`,
      ).toBe(true);
    }
  });

  it('points at the sitemap on the same origin it reports as host', () => {
    const sitemapUrl = new URL([rules.sitemap].flat()[0] as string);
    expect(sitemapUrl.pathname).toBe('/sitemap.xml');
    expect(sitemapUrl.host).toBe(rules.host);
    // The one that actually bites: a preview deployment advertising the
    // production domain's sitemap.
    expect(sitemapUrl.origin).toBe(new URL(sitemap()[0].url).origin);
  });
});

/**
 * The pair that has to agree.
 *
 * Google refused to index `/` on 2026-08-19 with "duplicate without a
 * user-selected canonical": it had found `www.zamak.app` as well as the apex
 * and we shipped no `<link rel="canonical">` at all. The fix is a
 * self-referencing canonical on each public page — and the failure mode of
 * *that* fix is a canonical that quietly names a different URL than the
 * sitemap does, which is a worse signal than having none.
 *
 * So: the canonicals and the sitemap are asserted to be the same set of paths.
 * Adding a public page means touching both, and forgetting either one fails
 * here.
 */
describe('canonical URLs', () => {
  const canonicalOf = (m: { alternates?: { canonical?: unknown } }) =>
    String(m.alternates?.canonical);

  it('every sitemap page declares a self-referencing canonical', async () => {
    const pages = Object.fromEntries(
      await Promise.all(
        [
          ['/', import('./page')],
          ['/legal', import('./legal/page')],
          ['/legal/privacy', import('./legal/privacy/page')],
        ].map(async ([path, mod]) => [
          path as string,
          canonicalOf((await (mod as Promise<{ metadata: object }>)).metadata),
        ]),
      ),
    );

    for (const [path, canonical] of Object.entries(pages)) {
      expect(canonical, `${path} canonical`).toBe(path);
    }
  });

  it('covers exactly the sitemap, no more and no less', async () => {
    const declared = ['/', '/legal', '/legal/privacy'];
    expect(sitemap().map((e) => new URL(e.url).pathname).sort()).toEqual(
      [...declared].sort(),
    );
  });
});

/**
 * 네이버 웹페이지 최적화 진단이 80자를 넘는 설명문을 경고한다. 2026-08-21에
 * 실제로 걸렸고(당시 101자), `페이지 설명`과 `Open Graph 설명` 두 항목이
 * 동시에 빨간불이었다 — 한 문자열이 셋을 다 먹이기 때문이다.
 *
 * 길이 규칙을 주석으로만 적어두면 다음 사람이 문구를 늘릴 때 아무것도 막지
 * 못한다. 진단은 우리가 돌려야 보이고, 그때는 이미 배포된 뒤다.
 */
describe('SITE.description', () => {
  it('네이버 권장 80자 이내다', () => {
    expect(SITE.description.length).toBeLessThanOrEqual(80);
  });

  it('제목과 설명이 서로 다른 말을 한다', () => {
    // 같은 문장을 양쪽에 넣으면 검색 결과에서 한 줄이 통째로 낭비된다.
    expect(SITE.description).not.toBe(SITE.title);
  });
});
