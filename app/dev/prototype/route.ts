import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Development-only: serves the brand prototype from `design_handoff_zamak_brand/`
 * over http so it can be opened, clicked through and compared side by side with
 * `/dev/preview`. Opening the file over `file://` renders but is inert — the
 * prototype's screen picker needs a real origin to work.
 *
 * Reads from disk at request time rather than living in `public/`, so the
 * handoff bundle never enters the production build.
 */
export const dynamic = 'force-dynamic';

const PROTOTYPE = path.join(
  process.cwd(),
  'design_handoff_zamak_brand',
  'ZAMAK 프로토타입 (브랜드).html',
);

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  try {
    const html = await readFile(PROTOTYPE, 'utf8');
    // `./support.js` would resolve against `/dev/` (this route has no trailing
    // slash), so point it at the sibling route explicitly.
    const served = html.replace(
      'src="./support.js"',
      'src="/dev/prototype/support.js"',
    );
    return new Response(served, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response(
      'design_handoff_zamak_brand/ 프로토타입 파일을 찾을 수 없습니다.',
      { status: 404 },
    );
  }
}
