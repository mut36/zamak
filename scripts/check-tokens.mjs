#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * CSS custom properties fail silently: `var(--typo)` produces no error, no
 * build warning and no type error — the declaration is simply dropped. This
 * script is the only thing standing between a rename typo and a shipped
 * colourless button, so it runs in the same breath as tsc/eslint.
 *
 * Checks:
 *   1. every `var(--x)` referenced under app/ is defined — in globals.css, or
 *      inline by the component that owns it (see INLINE_DEFINITION)
 *   2. every token defined in globals.css's `:root` is referenced somewhere
 *      (dead tokens are usually the other half of a bad rename)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CSS = join(ROOT, 'app/globals.css');

/** Tailwind supplies these itself; they are never declared in our token block. */
const EXTERNAL = new Set(['--font-jetbrains-mono']);

/**
 * A component can define a token too: `style={{ '--done-i': 3 }}` sets a real
 * custom property that React passes straight through to the element, which the
 * stylesheet then reads with `var(--done-i)`. Those quoted object keys are the
 * other half of such a pair.
 *
 * Counting them as definitions is deliberately narrower than exempting them:
 * an exemption would switch the check off for that name forever, while this
 * still fails loudly if only one side of the pair is renamed.
 */
const INLINE_DEFINITION = /(['"])(--[a-z0-9-]+)\1\s*:/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(path);
  }
  return out;
}

const files = walk(join(ROOT, 'app'));
const source = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
const css = source.get(CSS);

// Definitions: `--name:` at the start of a declaration, excluding `var(--name)`.
const defined = new Set(
  [...css.matchAll(/(?<!var\()(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

for (const [file, src] of source) {
  if (file.endsWith('.css')) continue;
  for (const m of src.matchAll(INLINE_DEFINITION)) defined.add(m[2]);
}

// `@theme` entries are consumed as Tailwind class names (`text-h1`), never as
// `var()`, so only the `:root` block is subject to the dead-token check.
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('@theme inline'));
const rootTokens = new Set(
  [...rootBlock.matchAll(/(?<!var\()(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
);

const used = new Map(); // token -> files referencing it
for (const [file, raw] of source) {
  // Inside `@theme`, every entry is `--color-x: var(--x)` — counting those as
  // usage would mark the whole palette "used" and hide dead tokens.
  const src =
    file === CSS ? raw.slice(raw.indexOf('}', raw.indexOf('@theme inline'))) : raw;
  for (const m of src.matchAll(/var\((--[a-z0-9-]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(file.slice(ROOT.length));
  }
}

const undef = [...used.keys()].filter(
  (t) => !defined.has(t) && !EXTERNAL.has(t),
);
// Tokens re-exported through `@theme` are the published palette: they are
// reached as Tailwind utilities (`bg-track`, `text-tertiary`), which this
// script cannot trace back to a `var()`. Exempt them; the remainder are
// internal tokens, where "defined but never referenced" is a real defect.
const themeBlock = css.slice(
  css.indexOf('@theme inline'),
  css.indexOf('}', css.indexOf('@theme inline')),
);
const exported = new Set(
  [...themeBlock.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]),
);

const unused = [...rootTokens].filter(
  (t) => !used.has(t) && !exported.has(t),
);

let bad = false;
if (undef.length) {
  bad = true;
  console.error('✗ undefined tokens referenced:');
  for (const t of undef.sort())
    console.error(`  ${t}  ← ${[...used.get(t)].join(', ')}`);
}
if (unused.length) {
  bad = true;
  console.error('✗ tokens defined but never used:');
  for (const t of unused.sort()) console.error(`  ${t}`);
}
if (!bad) console.log(`✓ ${defined.size} tokens, all defined and all used`);
process.exit(bad ? 1 : 0);
