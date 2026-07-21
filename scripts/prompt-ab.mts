#!/usr/bin/env node
// Prompt A/B harness — runs a real sample through the real translation path
// and reports the numbers a prompt change is allowed to be judged on.
//
//   npm run harness -- variants=meaning,cinematic
//   npm run harness -- file=samples/subtitles/short-smoke.srt variants=meaning
//   THINKING_LEVEL=MEDIUM npm run harness -- variants=meaning
//
// It calls the Gemini provider directly, so it needs no login, no credit and
// no dev server — but it does spend real API money. Every parameter is
// key=value, matching scripts/chunk-model.mjs.
//
// THINKING_LEVEL is read once at module load (config/constants.ts), so a level
// comparison is one process per level, not one run with a flag.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

import {
  parseSrtBlocks,
  chunkSrtBlocks,
  reassembleTranslatedChunk,
} from '../app/lib/srt';
import { composeTranslationPrompt } from '../app/lib/prompts/composer';
import { geminiProvider } from '../app/lib/providers/gemini';
import {
  SERVER_CHUNK_SIZE,
  SERVER_CONCURRENCY,
  THINKING_LEVEL,
  TRANSLATION_MODEL,
} from '../app/config/constants';
import type { TranslationStyle } from '../app/types/translation';

// ---------- parameters ----------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

const P = {
  file: args.file ?? 'samples/subtitles/full-movie.srt',
  variants: (args.variants ?? 'meaning,cinematic').split(','),
  /** Cap on chunks per variant — keeps a smoke run cheap. 0 = all. */
  limit: Number(args.limit ?? 0),
  out: args.out ?? '.harness',
  lang: args.lang ?? 'ko',
  title: args.title ?? '',
  year: args.year ?? '',
  notes: args.notes ?? '',
  // docs/tuning/gemini-limits.md §4
  pin: Number(args.pin ?? 1.5),
  pout: Number(args.pout ?? 9.0),
};

/**
 * The A/B axis. Today it is translationStyle, the one live switch that changes
 * the prompt (docs/decisions.md — the philosophy file is currently unreachable
 * because page.tsx hardcodes 'meaning'). Add an entry per prompt edit you want
 * to measure; everything downstream is variant-agnostic.
 */
const VARIANTS: Record<string, { style: TranslationStyle }> = {
  meaning: { style: 'meaning' },
  cinematic: { style: 'cinematic' },
};

// ---------- usage capture -------------------------------------------------

interface ChunkUsage {
  prompt: number;
  cached: number;
  thoughts: number;
  output: number;
}

/**
 * The provider reports token usage by logging, not by returning it. Rather
 * than change production code for a dev tool, attribute each [gemini] line to
 * the chunk whose async context it was emitted from — console.log runs inside
 * the caller's context, so this survives the concurrent pool.
 */
const callContext = new AsyncLocalStorage<{ id: number }>();
const usageByChunk = new Map<number, ChunkUsage>();
const USAGE_LINE =
  /^\[gemini\].*prompt=(\d+) cached=(\d+) thoughts=(\d+) output=(\d+)/;

const realLog = console.log;
console.log = (...params: unknown[]) => {
  const first = params[0];
  const store = callContext.getStore();
  if (store && typeof first === 'string') {
    const match = USAGE_LINE.exec(first);
    if (match) {
      usageByChunk.set(store.id, {
        prompt: Number(match[1]),
        cached: Number(match[2]),
        thoughts: Number(match[3]),
        output: Number(match[4]),
      });
      return; // swallow: the summary reports these
    }
  }
  realLog(...params);
};

// ---------- helpers -------------------------------------------------------

const NUMBER_LINE = /^\d+$/;

/** Blocks the model actually returned, counted the way composer.ts counts. */
function countReturnedBlocks(modelOutput: string): number {
  return modelOutput
    .split('\n')
    .filter((line) => NUMBER_LINE.test(line.trim())).length;
}

/** Least-squares fit of promptTokens = pFixed + tIn * blocks. */
function fitPromptTokens(points: { blocks: number; prompt: number }[]) {
  const n = points.length;
  if (n < 2) return { tIn: NaN, pFixed: NaN };
  const sx = points.reduce((a, p) => a + p.blocks, 0);
  const sy = points.reduce((a, p) => a + p.prompt, 0);
  const sxx = points.reduce((a, p) => a + p.blocks * p.blocks, 0);
  const sxy = points.reduce((a, p) => a + p.blocks * p.prompt, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { tIn: NaN, pFixed: NaN };
  const tIn = (n * sxy - sx * sy) / denom;
  return { tIn, pFixed: (sy - tIn * sx) / n };
}

async function pool<T, R>(
  items: T[],
  size: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await run(items[index], index);
      }
    }),
  );
  return results;
}

/** Body text of each block, keyed by sequence number. */
function bodiesByIndex(srt: string): Map<number, string> {
  const bodies = new Map<number, string>();
  for (const block of parseSrtBlocks(srt)) {
    const lines = block.split('\n');
    const seq = Number(lines[0]?.trim());
    if (Number.isInteger(seq)) bodies.set(seq, lines.slice(2).join('\n'));
  }
  return bodies;
}

// ---------- run -----------------------------------------------------------

interface VariantResult {
  name: string;
  srt: string;
  blocks: number;
  chunks: number;
  apiFailures: number;
  countMismatchChunks: number;
  unmatched: number;
  seconds: number;
  usage: ChunkUsage;
  fit: { tIn: number; pFixed: number };
  costUsd: number;
}

async function runVariant(
  name: string,
  sourceChunks: string[],
): Promise<VariantResult> {
  const variant = VARIANTS[name];
  if (!variant) {
    throw new Error(
      `Unknown variant "${name}". Known: ${Object.keys(VARIANTS).join(', ')}`,
    );
  }

  usageByChunk.clear();
  const movieInfo = { title: P.title, year: P.year, notes: P.notes };
  const startedAt = Date.now();
  let apiFailures = 0;
  let countMismatchChunks = 0;
  let unmatched = 0;

  const translated = await pool(
    sourceChunks,
    SERVER_CONCURRENCY,
    async (chunk, index) => {
      const expected = parseSrtBlocks(chunk).length;
      const { system, user } = await composeTranslationPrompt('gemini', {
        movieInfo,
        targetLanguage: P.lang,
        translationMode: 'chunk',
        translationStyle: variant.style,
        subtitleContent: chunk,
        chunkPosition: { index: index + 1, total: sourceChunks.length },
      });

      let output = '';
      try {
        output = await callContext.run({ id: index }, () =>
          geminiProvider.generateText({
            model: TRANSLATION_MODEL,
            prompt: user,
            systemInstruction: system,
            translationMode: 'chunk',
          }),
        );
      } catch (error) {
        apiFailures++;
        realLog(
          `  chunk ${index + 1} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return chunk; // production keeps the source chunk on failure
      }

      if (countReturnedBlocks(output) !== expected) countMismatchChunks++;
      const rebuilt = reassembleTranslatedChunk(chunk, output);
      unmatched += rebuilt.unmatched;
      realLog(
        `  chunk ${index + 1}/${sourceChunks.length} · ${rebuilt.matched}/${rebuilt.total} matched`,
      );
      return rebuilt.content;
    },
  );

  const seconds = (Date.now() - startedAt) / 1000;
  const usage = [...usageByChunk.values()].reduce(
    (a, u) => ({
      prompt: a.prompt + u.prompt,
      cached: a.cached + u.cached,
      thoughts: a.thoughts + u.thoughts,
      output: a.output + u.output,
    }),
    { prompt: 0, cached: 0, thoughts: 0, output: 0 },
  );

  const fit = fitPromptTokens(
    sourceChunks
      .map((chunk, index) => ({
        blocks: parseSrtBlocks(chunk).length,
        prompt: usageByChunk.get(index)?.prompt ?? NaN,
      }))
      .filter((point) => Number.isFinite(point.prompt)),
  );

  return {
    name,
    srt: translated.join('\n\n'),
    blocks: sourceChunks.reduce((a, c) => a + parseSrtBlocks(c).length, 0),
    chunks: sourceChunks.length,
    apiFailures,
    countMismatchChunks,
    unmatched,
    seconds,
    usage,
    fit,
    costUsd:
      (usage.prompt * P.pin + (usage.thoughts + usage.output) * P.pout) / 1e6,
  };
}

// ---------- report --------------------------------------------------------

function summaryMarkdown(results: VariantResult[]): string {
  const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(2) : '—');
  const rows = results.map(
    (r) =>
      `| ${r.name} | ${r.blocks} | ${r.chunks} | ${r.apiFailures} | ` +
      `${r.countMismatchChunks} | ${r.unmatched} (${pct(r.unmatched, r.blocks)}%) | ` +
      `${r.seconds.toFixed(1)}s | ${r.usage.prompt} | ${r.usage.cached} | ` +
      `${r.usage.thoughts} | ${r.usage.output} | ` +
      `${r.fit.pFixed.toFixed(0)} | ${r.fit.tIn.toFixed(1)} | ` +
      `$${r.costUsd.toFixed(4)} |`,
  );

  return [
    `# 프롬프트 A/B — ${new Date().toISOString()}`,
    '',
    `- 파일: \`${P.file}\``,
    `- 모델: \`${TRANSLATION_MODEL}\` · THINKING_LEVEL=**${THINKING_LEVEL}**`,
    `- 청크 크기 ${SERVER_CHUNK_SIZE} · 동시성 ${SERVER_CONCURRENCY}`,
    '',
    '| 변형 | 블록 | 청크 | API실패 | 블록수불일치 | 정렬실패 | 시간 | 입력tok | 캐시tok | thinking | 출력tok | P_fixed | t_in | 비용 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '- **정렬실패** = 번역이 붙지 않아 원문으로 남은 블록. 기준선 0.5~0.65%',
    '- **P_fixed·t_in** = 청크별 (블록수, 입력토큰) 최소제곱 적합. 프롬프트를 바꾸면 여기가 움직인다',
    '- thinking은 출력 단가로 과금된다',
  ].join('\n');
}

function diffMarkdown(a: VariantResult, b: VariantResult): string {
  const left = bodiesByIndex(a.srt);
  const right = bodiesByIndex(b.srt);
  const lines: string[] = [
    `# ${a.name} vs ${b.name} — 다르게 번역된 줄만`,
    '',
  ];

  let differing = 0;
  for (const [index, leftBody] of left) {
    const rightBody = right.get(index);
    if (rightBody === undefined || rightBody === leftBody) continue;
    differing++;
    lines.push(
      `### ${index}`,
      `- **${a.name}**: ${leftBody.replace(/\n/g, ' / ')}`,
      `- **${b.name}**: ${rightBody.replace(/\n/g, ' / ')}`,
      '',
    );
  }

  lines.splice(
    2,
    0,
    `공통 블록 ${left.size}개 중 **${differing}개**가 다름 ` +
      `(${((differing / (left.size || 1)) * 100).toFixed(1)}%).`,
    '',
  );
  return lines.join('\n');
}

// ---------- main ----------------------------------------------------------

const source = readFileSync(path.resolve(P.file), 'utf8');
const blocks = parseSrtBlocks(source);
if (blocks.length === 0) {
  realLog(`${P.file} is empty — see samples/subtitles/README.md.`);
  process.exit(1);
}

let sourceChunks = chunkSrtBlocks(blocks, SERVER_CHUNK_SIZE);
if (P.limit > 0) sourceChunks = sourceChunks.slice(0, P.limit);

realLog(
  `${P.file}: ${blocks.length} blocks → ${sourceChunks.length} chunks ` +
    `(B=${SERVER_CHUNK_SIZE}, K=${SERVER_CONCURRENCY}, thinking=${THINKING_LEVEL})`,
);

const results: VariantResult[] = [];
for (const name of P.variants) {
  realLog(`\n▶ ${name}`);
  results.push(await runVariant(name, sourceChunks));
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(P.out, stamp);
mkdirSync(outDir, { recursive: true });

for (const result of results) {
  writeFileSync(path.join(outDir, `${result.name}.srt`), result.srt);
}
writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(
    { file: P.file, thinking: THINKING_LEVEL, model: TRANSLATION_MODEL, results:
      results.map(({ srt: _srt, ...rest }) => rest) },
    null,
    2,
  ),
);
const summary = summaryMarkdown(results);
writeFileSync(path.join(outDir, 'summary.md'), summary);

for (let i = 0; i + 1 < results.length; i++) {
  writeFileSync(
    path.join(outDir, `diff-${results[i].name}-vs-${results[i + 1].name}.md`),
    diffMarkdown(results[i], results[i + 1]),
  );
}

realLog(`\n${summary}\n\n→ ${outDir}`);
