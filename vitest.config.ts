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
  },
});
