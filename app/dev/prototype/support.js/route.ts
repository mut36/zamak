import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Development-only: the prototype's template runtime (`<x-dc>`, `{{ }}` holes,
 * `sc-if`/`sc-for`). The prototype HTML loads it as `./support.js`, which
 * resolves to this path under `/dev/prototype`. Without it the prototype
 * renders every screen at once with its template holes unfilled.
 */
export const dynamic = 'force-dynamic';

const SUPPORT = path.join(
  process.cwd(),
  'design_handoff_zamak_brand',
  'support.js',
);

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  try {
    const js = await readFile(SUPPORT, 'utf8');
    return new Response(js, {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
  } catch {
    return new Response('// support.js not found', {
      status: 404,
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    });
  }
}
