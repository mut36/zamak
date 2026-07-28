#!/usr/bin/env node
// Glossary prepass A/B — runs the cast-sheet extraction against a real
// sample and reports cost + quality for one combo per process (same
// reasoning as prompt-ab.mts: model/thinking constants are read once at
// module load, so a combo comparison is one process per combo).
//
//   npm run glossary -- file=samples/subtitles/drama-episode.srt title="Esterno Notte" year=2022
//
//   provider=gemini (default): GLOSSARY_MODEL / GLOSSARY_THINKING_LEVEL env
//     GLOSSARY_MODEL=gemini-3.5-flash-lite npm run glossary -- title=...
//
//   provider=claude: uses app/lib/providers/claude.ts (ANTHROPIC_API_KEY),
//     model=claude-sonnet-5 or CLAUDE_MODEL env
//     npm run glossary -- provider=claude title=... file=...
//
//   provider=openai: uses app/lib/providers/openai.ts (OPENAI_API_KEY),
//     model= or OPENAI_MODEL env is REQUIRED (no guessed default)
//     npm run glossary -- provider=openai model=gpt-5 title=... file=...
//
// All three run the *same* system/user prompt (buildSystemInstruction /
// buildUserTurn, exported from extractCastSheet.ts for this reuse) through
// sanitizeCastSheet, so the comparison is apples-to-apples — only the API
// call and structured-output mechanism differ.
//
// GLOSSARY_DEBUG=1 (set by this script) makes sanitizeCastSheet log a
// [glossary-sanitize] line with term-kind counts and the droppedNonPerson
// count — the regression guard for the 2026-07-28 city-as-speaker bug.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

process.env.GLOSSARY_DEBUG = '1';

const {
  extractCastSheet,
  buildSystemInstruction,
  buildUserTurn,
  sanitizeCastSheet,
  fetchCastAnchors,
} = await import('../app/lib/server/extractCastSheet');
const { GLOSSARY_MODEL, GLOSSARY_THINKING_LEVEL } = await import(
  '../app/config/constants'
);
const { resolveTargetLang } = await import('../app/config/languages');
const { parseSrtBlocks } = await import('../app/lib/srt');

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

const P = {
  provider: args.provider ?? 'gemini',
  model: args.model ?? '',
  file: args.file ?? 'samples/subtitles/drama-episode.srt',
  lang: args.lang ?? 'ko',
  title: args.title ?? '',
  year: args.year ?? '',
  genre: args.genre ?? '',
  country: args.country ?? '',
  era: args.era ?? '',
  tone: args.tone ?? '',
  out: args.out ?? '.harness/glossary',
  // Per-model $/1M — gemini-limits.md §4 for flash/flash-lite. Claude/OpenAI
  // defaults are rough placeholders; pass pin=/pout= to override with your
  // own dashboard's numbers when precision matters.
  pin: Number(args.pin ?? 0),
  pout: Number(args.pout ?? 0),
};

const movieInfo = {
  title: P.title,
  year: P.year,
  genre: P.genre,
  country: P.country,
  era: P.era,
  tone: P.tone,
};

const source = readFileSync(path.resolve(P.file), 'utf8');

// Plain JSON Schema (not Gemini's Type-enum flavor) — shared by the
// claude/openai paths. OpenAI's strict mode requires every property listed
// in `required` and `additionalProperties: false` at every object level, so
// optional fields (note/basis) are modeled as always-present strings (empty
// = absent), which sanitizeCastSheet already treats as "no note"/"no basis".
const CAST_SHEET_JSON_SCHEMA = {
  type: 'object',
  properties: {
    terms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          kind: { type: 'string', enum: ['person', 'place', 'org', 'term'] },
          note: { type: 'string' },
        },
        required: ['source', 'target', 'kind', 'note'],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          speech: { type: 'string', enum: ['formal', 'informal', 'mixed'] },
          basis: { type: 'string' },
          fromBlock: { type: 'integer' },
          toBlock: { type: 'integer' },
        },
        required: ['from', 'to', 'speech', 'basis', 'fromBlock', 'toBlock'],
        additionalProperties: false,
      },
    },
  },
  required: ['terms', 'relations'],
  additionalProperties: false,
};

interface RunResult {
  sheet: { terms: unknown[]; relations: unknown[] };
  usage: { prompt: number; thoughts: number; output: number };
  model: string;
}

async function runGemini(): Promise<RunResult> {
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
  const sheet = await extractCastSheet(source, movieInfo, P.lang);
  console.log = realLog;
  return { sheet, usage, model: GLOSSARY_MODEL };
}

async function runNonGemini(provider: 'claude' | 'openai'): Promise<RunResult> {
  const blockCount = parseSrtBlocks(source).length;
  const lang = resolveTargetLang(P.lang);
  const [systemInstruction, cast] = await Promise.all([
    buildSystemInstruction(lang),
    fetchCastAnchors(movieInfo.title, movieInfo.year),
  ]);
  const userTurn = buildUserTurn(movieInfo, cast, source, blockCount);

  let json: unknown;
  let usage: { inputTokens: number; outputTokens: number };
  let model: string;

  if (provider === 'claude') {
    const { claudeGenerateJson, CLAUDE_MODEL } = await import(
      '../app/lib/providers/claude'
    );
    model = P.model || CLAUDE_MODEL;
    ({ json, usage } = await claudeGenerateJson({
      model,
      system: systemInstruction,
      user: userTurn,
      jsonSchema: CAST_SHEET_JSON_SCHEMA,
      schemaName: 'cast_sheet',
    }));
  } else {
    const { openaiGenerateJson, requireOpenAiModel } = await import(
      '../app/lib/providers/openai'
    );
    model = P.model || requireOpenAiModel();
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
    sheet,
    usage: { prompt: usage.inputTokens, thoughts: 0, output: usage.outputTokens },
    model,
  };
}

if (!['gemini', 'claude', 'openai'].includes(P.provider)) {
  console.error(`Unknown provider "${P.provider}". Use gemini, claude, or openai.`);
  process.exit(1);
}

const startedAt = Date.now();
const { sheet, usage, model } =
  P.provider === 'gemini' ? await runGemini() : await runNonGemini(P.provider as 'claude' | 'openai');
const seconds = (Date.now() - startedAt) / 1000;

const costUsd =
  P.pin || P.pout
    ? (usage.prompt * P.pin + (usage.thoughts + usage.output) * P.pout) / 1e6
    : NaN;

const kindCounts = ['person', 'place', 'org', 'term']
  .map(
    (k) =>
      `${k}=${(sheet.terms as { kind: string }[]).filter((t) => t.kind === k).length}`,
  )
  .join(' ');

const costLine = Number.isFinite(costUsd)
  ? `$${costUsd.toFixed(4)}`
  : '(pin=/pout= 안 줌 — 토큰 수만 참고)';

const summary = [
  `# 글로사리 A/B — ${new Date().toISOString()}`,
  '',
  `- 파일: \`${P.file}\``,
  `- 프로바이더: **${P.provider}** · 모델: \`${model}\`${
    P.provider === 'gemini' ? ` · THINKING_LEVEL=**${GLOSSARY_THINKING_LEVEL}**` : ''
  }`,
  '',
  `| 시간 | 입력tok | thinking | 출력tok | 비용 | terms(${kindCounts}) | relations |`,
  '|---|---|---|---|---|---|---|',
  `| ${seconds.toFixed(1)}s | ${usage.prompt} | ${usage.thoughts} | ${usage.output} | ${costLine} | ${sheet.terms.length} | ${sheet.relations.length} |`,
  '',
  '## terms',
  ...(sheet.terms as { kind: string; source: string; target: string; note?: string }[]).map(
    (t) => `- [${t.kind}] ${t.source} → ${t.target}${t.note ? ` (${t.note})` : ''}`,
  ),
  '',
  '## relations',
  ...(
    sheet.relations as {
      from: string;
      to: string;
      speech: string;
      fromBlock: number;
      toBlock: number;
      basis?: string;
    }[]
  ).map(
    (r) =>
      `- ${r.from} → ${r.to}: ${r.speech} (블록 ${r.fromBlock}-${r.toBlock})${r.basis ? ` — ${r.basis}` : ''}`,
  ),
].join('\n');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(P.out, stamp);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'summary.md'), summary);
writeFileSync(path.join(outDir, 'sheet.json'), JSON.stringify(sheet, null, 2));

console.log(`\n${summary}\n\n→ ${outDir}`);
