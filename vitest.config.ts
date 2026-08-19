import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Agent worktrees under .claude/ share prompts/ via cwd but keep stale
    // app/ copies — never pick up their tests when running the main suite.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
    ],
    alias: {
      // `server-only` throws on import outside a React Server Component, which
      // is exactly its job — but it also stops a test from importing a server
      // page just to read its exported `metadata` (app/seo.test.ts does, to
      // check the canonicals). The guard protects the bundle, not the suite.
      'server-only': new URL(
        './test/stubs/server-only.ts',
        import.meta.url,
      ).pathname,
    },
  },
});
