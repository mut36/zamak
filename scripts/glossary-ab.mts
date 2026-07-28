#!/usr/bin/env node
// Glossary prepass A/B — runs the cast-sheet extraction against a real
// sample and reports cost + quality.
//
//   npm run glossary -- file=samples/subtitles/drama-episode.srt title="Esterno Notte" year=2022
//
//   provider=gemini (default for this harness — forces GLOSSARY_PROVIDER=gemini
//     before constants load so GLOSSARY_MODEL defaults to FLASH_MODEL; production
//     defaults to openai/gpt-5.6-luna). Override model:
//     GLOSSARY_MODEL=gemini-3.5-flash-lite npm run glossary -- title=...
//
//   provider=claude / openai: uses app/lib/providers/claude.ts / openai.ts
//     (ANTHROPIC_API_KEY / OPENAI_API_KEY). Pass ONE model (model=... or
//     CLAUDE_MODEL/OPENAI_MODEL env), or MULTIPLE with models= (comma list) —
//     the multi-model form builds the prompt once and fans out to every
//     model in parallel, since (unlike Gemini's env-level constants) the
//     model name here is just a function argument:
//     npm run glossary -- provider=openai models=gpt-5.6-luna,gpt-5.6-mini,gpt-5-nano title=...
//
// All providers run the *same* system/user prompt (buildSystemInstruction /
// buildUserTurn, exported from extractCastSheet.ts for this reuse) through
// sanitizeCastSheet, so the comparison is apples-to-apples — only the API
// call and structured-output mechanism differ. CAST_SHEET_JSON_SCHEMA is
// shared with production (exported from extractCastSheet.ts).
//
// GLOSSARY_DEBUG=1 (set by this script) makes sanitizeCastSheet log a
// [glossary-sanitize] line with term-kind counts and the droppedNonPerson
// count — the regression guard for the 2026-07-28 city-as-speaker bug.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

process.env.GLOSSARY_DEBUG = '1';

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

const P = {
  provider: args.provider ?? 'gemini',
  model: args.model ?? '',
  models: args.models ?? '',
  file: args.file ?? 'samples/subtitles/drama-episode.srt',
  lang: args.lang ?? 'ko',
  title: args.title ?? '',
  year: args.year ?? '',
  genre: args.genre ?? '',
  country: args.country ?? '',
  era: args.era ?? '',
  tone: args.tone ?? '',
  out: args.out ?? '.harness/glossary',
  // Per-model $/1M — pass pin=/pout= with your own dashboard's numbers when
  // precision matters; left unset here since exact non-Gemini pricing isn't
  // hardcoded (model names/rates turn over too fast to bake in safely).
  pin: Number(args.pin ?? 0),
  pout: Number(args.pout ?? 0),
};

// Force Gemini before constants.ts evaluates GLOSSARY_MODEL's default
// (production default is openai → gpt-5.6-luna).
if (P.provider === 'gemini') {
  process.env.GLOSSARY_PROVIDER = 'gemini';
}

const {
  extractCastSheet,
  buildSystemInstruction,
  buildUserTurn,
  sanitizeCastSheet,
  fetchCastAnchors,
  CAST_SHEET_JSON_SCHEMA,
} = await import('../app/lib/server/extractCastSheet');
const { GLOSSARY_MODEL, GLOSSARY_THINKING_LEVEL } = await import(
  '../app/config/constants'
);
const { resolveTargetLang } = await import('../app/config/languages');
const { parseSrtBlocks } = await import('../app/lib/srt');

const movieInfo = {
  title: P.title,
  year: P.year,
  genre: P.genre,
  country: P.country,
  era: P.era,
  tone: P.tone,
};

const source = readFileSync(path.resolve(P.file), 'utf8');

type Sheet = { terms: unknown[]; relations: unknown[] };

interface RunResult {
  provider: string;
  model: string;
  sheet: Sheet;
  usage: { prompt: number; thoughts: number; output: number };
  seconds: number;
  error?: string;
}

async function runGemini(): Promise<RunResult> {
  // extractCastSheet reads GLOSSARY_PROVIDER at call time; keep gemini forced.
  process.env.GLOSSARY_PROVIDER = 'gemini';
  const usageLine = /^\[glossary\].*prompt=(\d+) thoughts=(\d+) output=(\d+)/;
  let usage = { prompt: 0, thoughts: 0, output: 0 };
  const realLog = console.log;
  console.log = (...params: unknown[]) => {
    const first = params[0];
    if (typeof first === 'string') {
      const match = usageLine.exec(first);
      if (match) {
        usage = {
          prompt: Number(match[1]),
          thoughts: Number(match[2]),
          output: Number(match[3]),
        };
      }
    }
    realLog(...params);
  };
  const startedAt = Date.now();
  const sheet = await extractCastSheet(source, movieInfo, P.lang);
  console.log = realLog;
  return { provider: 'gemini', model: GLOSSARY_MODEL, sheet, usage, seconds: (Date.now() - startedAt) / 1000 };
}

/**
 * Builds the shared system/user prompt once, then fans out to every model in
 * parallel — the whole point of the multi-model form is that the prompt
 * doesn't change, only which model answers it, so preparing it once keeps
 * the comparison honest and avoids redundant TMDB cast-anchor lookups.
 */
async function runNonGeminiModels(
  provider: 'claude' | 'openai',
  models: string[],
): Promise<RunResult[]> {
  const blockCount = parseSrtBlocks(source).length;
  const lang = resolveTargetLang(P.lang);
  const [systemInstruction, cast] = await Promise.all([
    buildSystemInstruction(lang),
    fetchCastAnchors(movieInfo.title, movieInfo.year),
  ]);
  const userTurn = buildUserTurn(movieInfo, cast, source, blockCount);

  return Promise.all(
    models.map(async (model): Promise<RunResult> => {
      const startedAt = Date.now();
      try {
        let json: unknown;
        let usage: { inputTokens: number; outputTokens: number };

        if (provider === 'claude') {
          const { claudeGenerateJson } = await import('../app/lib/providers/claude');
          ({ json, usage } = await claudeGenerateJson({
            model,
            system: systemInstruction,
            user: userTurn,
            jsonSchema: CAST_SHEET_JSON_SCHEMA,
            schemaName: 'cast_sheet',
          }));
        } else {
          const { openaiGenerateJson } = await import('../app/lib/providers/openai');
          ({ json, usage } = await openaiGenerateJson({
            model,
            system: systemInstruction,
            user: userTurn,
            jsonSchema: CAST_SHEET_JSON_SCHEMA,
            schemaName: 'cast_sheet',
          }));
        }

        const sheet = sanitizeCastSheet(
          json as { terms?: unknown; relations?: unknown },
          source,
          blockCount,
          lang.formality !== null,
        );
        return {
          provider,
          model,
          sheet,
          usage: { prompt: usage.inputTokens, thoughts: 0, output: usage.outputTokens },
          seconds: (Date.now() - startedAt) / 1000,
        };
      } catch (error) {
        return {
          provider,
          model,
          sheet: { terms: [], relations: [] },
          usage: { prompt: 0, thoughts: 0, output: 0 },
          seconds: (Date.now() - startedAt) / 1000,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

if (!['gemini', 'claude', 'openai'].includes(P.provider)) {
  console.error(`Unknown provider "${P.provider}". Use gemini, claude, or openai.`);
  process.exit(1);
}

let results: RunResult[];
if (P.provider === 'gemini') {
  results = [await runGemini()];
} else {
  const modelList = P.models
    ? P.models.split(',').map((m) => m.trim()).filter(Boolean)
    : P.model
      ? [P.model]
      : [];
  if (modelList.length === 0) {
    const envVar = P.provider === 'claude' ? 'CLAUDE_MODEL' : 'OPENAI_MODEL';
    console.error(
      `No model given — pass model=<one> or models=<a,b,c>, or set ${envVar}.`,
    );
    process.exit(1);
  }
  results = await runNonGeminiModels(P.provider as 'claude' | 'openai', modelList);
}

function kindCounts(sheet: Sheet): string {
  return ['person', 'place', 'org', 'term']
    .map((k) => `${k}=${(sheet.terms as { kind: string }[]).filter((t) => t.kind === k).length}`)
    .join(' ');
}

function costLine(usage: RunResult['usage']): string {
  if (!P.pin && !P.pout) return '—';
  const usd = (usage.prompt * P.pin + (usage.thoughts + usage.output) * P.pout) / 1e6;
  return `$${usd.toFixed(4)}`;
}

const comparisonRows = results.map(
  (r) =>
    `| ${r.model} | ${r.error ? '❌' : '✅'} | ${r.seconds.toFixed(1)}s | ${r.usage.prompt} | ${r.usage.output} | ${costLine(r.usage)} | ${r.sheet.terms.length} (${kindCounts(r.sheet)}) | ${r.sheet.relations.length} |`,
);

const detailSections = results.flatMap((r) => [
  '',
  `## ${r.model}${r.error ? ' — 실패' : ''}`,
  ...(r.error
    ? [`오류: ${r.error}`]
    : [
        '',
        '### terms',
        ...(r.sheet.terms as { kind: string; source: string; target: string; note?: string }[]).map(
          (t) => `- [${t.kind}] ${t.source} → ${t.target}${t.note ? ` (${t.note})` : ''}`,
        ),
        '',
        '### relations',
        ...(
          r.sheet.relations as {
            from: string;
            to: string;
            speech: string;
            fromBlock: number;
            toBlock: number;
            basis?: string;
          }[]
        ).map(
          (rel) =>
            `- ${rel.from} → ${rel.to}: ${rel.speech} (블록 ${rel.fromBlock}-${rel.toBlock})${rel.basis ? ` — ${rel.basis}` : ''}`,
        ),
      ]),
]);

const summary = [
  `# 글로사리 A/B — ${new Date().toISOString()}`,
  '',
  `- 파일: \`${P.file}\``,
  `- 프로바이더: **${P.provider}**${
    P.provider === 'gemini' ? ` · 모델: \`${GLOSSARY_MODEL}\` · THINKING_LEVEL=**${GLOSSARY_THINKING_LEVEL}**` : ''
  }`,
  '',
  '| 모델 | 성공 | 시간 | 입력tok | 출력tok | 비용 | terms | relations |',
  '|---|---|---|---|---|---|---|---|',
  ...comparisonRows,
  ...detailSections,
].join('\n');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(P.out, stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'summary.md'), summary);
for (const r of results) {
  const safeModel = r.model.replace(/[^a-zA-Z0-9_.-]/g, '_');
  writeFileSync(path.join(outDir, `sheet.${safeModel}.json`), JSON.stringify(r.sheet, null, 2));
}

console.log(`\n${summary}\n\n→ ${outDir}`);
