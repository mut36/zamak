import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './components/simple/LandingPage';
import { COPY } from './i18n/simpleCopy';

/**
 * The one thing `/` must never lose again.
 *
 * Until 2026-08-19 this page's marketing copy reached no crawler: `page.tsx`
 * was a client component whose `authLoading` branch returned an empty div, and
 * `loading` is true during the server render, so the served document's only
 * text was the `<title>` (see the note in page.tsx). Nothing failed — the app
 * worked fine in a browser — which is exactly why it went unnoticed.
 *
 * So the assertion is deliberately about *server* markup: render LandingPage
 * with no browser, no effects, no hydration, and require the copy to already
 * be there. A future refactor that pushes the landing back behind a
 * client-only gate fails here.
 */
describe('landing page server markup', () => {
  const html = renderToStaticMarkup(<LandingPage />);

  it('renders the hero copy without a browser', () => {
    expect(html).toContain(COPY.landing.hero.titleBrand);
    expect(html).toContain(COPY.landing.cta);
  });

  it('carries one h1 and no heading above it', () => {
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it('renders every section heading', () => {
    // Sections are what a search result can actually land on; an empty shell
    // would still pass the hero check if only the header survived.
    expect((html.match(/<h2[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('needs no props to render', () => {
    // Guards the server/client boundary: `page.tsx` is a server component and
    // cannot pass a function, so the day someone re-adds an `onSignIn` prop
    // this stops compiling rather than silently rendering a dead CTA.
    expect(html.length).toBeGreaterThan(2000);
  });
});

/**
 * The check above renders LandingPage directly, so it would still pass if `/`
 * itself regressed to a client-only gate — which is precisely what broke last
 * time. This pins the route.
 */
describe('/ route shape', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

  it('is a server component', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(false);
  });

  it('decides the two halves from a server-side session read', () => {
    expect(source).toContain('supabase.auth.getUser()');
    expect(source).toContain('<WizardApp />');
    expect(source).toContain('<LandingPage />');
  });
});
