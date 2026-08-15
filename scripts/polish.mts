#!/usr/bin/env node
// 스타일 교정 하네스 — 이미 번역된 한국어 자막을 **형식만** 손보고, 모델이 그 선을
// 지켰는지 기계적으로 채점한다.
//
//   npm run polish -- limit=1
//   npm run polish -- roughen=true limit=1 model=gemini-3.5-flash-lite out=.polish/lite
//
// 잘 만들어진 한글 자막은 고칠 게 거의 없어서 그냥 돌리면 어떤 모델이든 "변경 0"으로
// 통과한다 — 모델을 실제로 시험하려면 `roughen=true`(블록을 한 줄로 붙여 상한 초과를
// 만들어냄)를 쓴다. 이때 원본의 줄바꿈이 정답지 역할을 한다.
//
// 번역 하네스(prompt-ab.mts)와 같은 자리에서 산다: Gemini 프로바이더를 직접 불러
// 로그인·크레딧·dev 서버 없이 돌지만 **실제 API 비용이 나간다**. 파라미터는 전부
// key=value.
//
// 이 도구는 프로덕션 경로가 아니다 — 프롬프트도 `scripts/prompts/` 아래에 따로 두어
// `npm run check:tokens`가 재는 프로덕션 프롬프트 예산에 섞이지 않게 했다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  parseSrtBlocks,
  chunkSrtBlocksAtGaps,
  enforceTextRules,
  formatBlocksForModel,
  reassembleTranslatedChunk,
} from '../app/lib/srt';
import { geminiProvider } from '../app/lib/providers/gemini';
import { runOrderedPool } from '../app/lib/client/concurrency';
import { resolveTargetLang } from '../app/config/languages';
import {
  SERVER_CONCURRENCY,
  TRANSLATION_MODEL,
  chunkSizeForModel,
} from '../app/config/constants';

// ---------- parameters ----------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

const P = {
  file:
    args.file ??
    'samples/subtitles/Marx può aspettare (Marco Bellocchio, 2021).ko.srt',
  /** Cap on chunks — keeps a smoke run cheap. 0 = all. */
  limit: Number(args.limit ?? 0),
  out: args.out ?? '.polish',
  lang: args.lang ?? 'ko',
  /**
   * Defaults to whatever production translates with, so a plain run measures
   * the shipped setting. Overridable because polishing is a far narrower job
   * than translating and may not need the same tier — `model=gemini-3.5-flash-lite`
   * is the cheap end. The provider is called directly, so this is not limited
   * to `ALLOWED_MODELS` (which gates what users may pick, not what we may test).
   */
  model: args.model ?? TRANSLATION_MODEL,
  /**
   * Collapse every block onto one line before polishing, which manufactures
   * over-length lines for the model to break.
   *
   * A well-made Korean subtitle has almost nothing to fix — the one in
   * `samples/` has 1 over-budget line in 1126 blocks — so a plain run measures
   * an empty task and every model "passes". Roughening turns that same file
   * into a test with a known answer: the original's own line breaks are a
   * professional's, so the output can be compared against them.
   */
  roughen: args.roughen === 'true',
};

const LANG = resolveTargetLang(P.lang);
const CHUNK_SIZE = chunkSizeForModel(TRANSLATION_MODEL);
const PROMPT_PATH = path.join(import.meta.dirname, 'prompts/style_polish_ko.txt');

// ---------- prompt --------------------------------------------------------

/** Trailing bookkeeping line the prompt asks for — never part of a subtitle. */
const COMPRESSED_LINE = /^\s*COMPRESSED\s*:.*$/gim;

function buildSystemPrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8').replaceAll(
    '{{lineMaxChars}}',
    String(LANG.lineMaxChars),
  );
}

/**
 * Splits the model's reply into the subtitle lines and the numbers it admits
 * compressing. The COMPRESSED line has no `[N]` marker, so leaving it in would
 * let the reassembler absorb it into whichever block was still open.
 */
function splitReply(reply: string): { body: string; compressed: number[] } {
  const compressed = new Set<number>();
  for (const match of reply.matchAll(COMPRESSED_LINE)) {
    for (const token of match[0].split(':')[1]?.split(',') ?? []) {
      const n = Number(token.trim());
      if (Number.isInteger(n)) compressed.add(n);
    }
  }
  return {
    body: reply.replace(COMPRESSED_LINE, '').trim(),
    compressed: [...compressed].sort((a, b) => a - b),
  };
}

// ---------- scoring -------------------------------------------------------

const MARKUP_TAG = /<[^>]+>/g;

/**
 * The letters, and nothing else. Two bodies with the same signature differ
 * only in whitespace, line breaks and punctuation — i.e. in exactly the ways a
 * format-only pass is allowed to differ. Anything else is the model rewriting.
 */
function letterSignature(body: string): string {
  return body
    .replace(MARKUP_TAG, '')
    .replace(/[\s.,!?…"'“”‘’·:;\-–—()[\]]/g, '');
}

function visibleLength(line: string): number {
  return line.replace(MARKUP_TAG, '').trim().length;
}

type Verdict = 'FORMAT' | 'REWRITE';

interface Change {
  index: number;
  before: string;
  after: string;
  verdict: Verdict;
  /** The model said it compressed this one, so REWRITE is expected here. */
  admitted: boolean;
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

/** Every block's body onto one line — see P.roughen. */
function roughen(srt: string): string {
  return parseSrtBlocks(srt)
    .map((raw) => {
      const lines = raw.split('\n');
      const body = lines
        .slice(2)
        .map((line) => line.trim())
        .filter(Boolean);
      if (body.length < 2) return raw;
      return [lines[0], lines[1], body.join(' ')].join('\n');
    })
    .join('\n\n');
}

const rawSource = readFileSync(path.resolve(P.file), 'utf8').replace(/^﻿/, '');
const source = P.roughen ? roughen(rawSource) : rawSource;
const blocks = parseSrtBlocks(source);
if (blocks.length === 0) {
  console.log(`${P.file} is empty — see samples/subtitles/README.md.`);
  process.exit(1);
}

let sourceChunks = chunkSrtBlocksAtGaps(blocks, CHUNK_SIZE);
if (P.limit > 0) sourceChunks = sourceChunks.slice(0, P.limit);

const system = buildSystemPrompt();
const admittedCompression = new Set<number>();

console.log(
  `polish: ${blocks.length} blocks → ${sourceChunks.length} chunks ` +
    `(size ${CHUNK_SIZE}, concurrency ${SERVER_CONCURRENCY}), model ${P.model}`,
);

const startedAt = Date.now();
let apiFailures = 0;
/**
 * Blocks belonging to a chunk the model never answered for. They are excluded
 * from the score below: a failed chunk falls back to its source text, and the
 * mechanical rules then reformat it — which would otherwise show up in the
 * report as a clean pile of FORMAT changes the model never made.
 */
const unscored = new Set<number>();

const ATTEMPTS = 3;

const polishedChunks = await runOrderedPool<string, string>({
  items: sourceChunks,
  concurrency: SERVER_CONCURRENCY,
  signal: new AbortController().signal,
  worker: async (chunk, index) => {
    const expected = parseSrtBlocks(chunk).length;
    const user =
      `<subtitle_data>\n${formatBlocksForModel(chunk)}\n</subtitle_data>\n\n` +
      `이 청크의 자막 블록 수: ${expected}개. 출력도 반드시 ${expected}개여야 해.`;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const generated = await geminiProvider.generateText({
          model: P.model,
          prompt: user,
          systemInstruction: system,
          translationMode: 'chunk',
        });
        const { body, compressed } = splitReply(generated.text);
        for (const n of compressed) admittedCompression.add(n);

        const rebuilt = reassembleTranslatedChunk(chunk, body);
        console.log(
          `  chunk ${index + 1}/${sourceChunks.length} · ${rebuilt.matched}/${rebuilt.total} matched`,
        );
        // A block the model skipped kept its source text, so it is not a
        // judgement about the model's formatting either.
        for (const missed of rebuilt.unmatchedIndices) unscored.add(missed);
        return rebuilt.content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(
          `  chunk ${index + 1} attempt ${attempt}/${ATTEMPTS} failed: ${message}`,
        );
        if (attempt === ATTEMPTS) {
          apiFailures++;
          for (const raw of parseSrtBlocks(chunk)) {
            const seq = Number(raw.split('\n')[0]?.trim());
            if (Number.isInteger(seq)) unscored.add(seq);
          }
          return chunk; // keep the source chunk, same as production
        }
      }
    }
    return chunk;
  },
});

/** Straight from the model, before any mechanical rule touches it. */
const modelOutput = polishedChunks.join('\n\n');

// The same mechanical rules production applies. Keeping both strings is what
// lets the report separate the two authors: without it, a run where the model
// did nothing at all is indistinguishable from a run where it worked, because
// `enforceTextRules` reformats the fallback text just the same.
const { content: polished, report: textRuleReport } = enforceTextRules(
  modelOutput,
  {
    trailingPunctuation: LANG.trailingPunctuation,
    lineMaxChars: LANG.lineMaxChars,
  },
);

// ---------- report --------------------------------------------------------

const scopedSource = sourceChunks.join('\n\n');
const before = bodiesByIndex(scopedSource);
const fromModel = bodiesByIndex(modelOutput);
const after = bodiesByIndex(polished);

function collectChanges(target: Map<number, string>): Change[] {
  const collected: Change[] = [];
  for (const [index, beforeBody] of before) {
    const afterBody = target.get(index);
    if (afterBody === undefined || afterBody === beforeBody) continue;
    if (unscored.has(index)) continue;
    collected.push({
      index,
      before: beforeBody,
      after: afterBody,
      verdict:
        letterSignature(beforeBody) === letterSignature(afterBody)
          ? 'FORMAT'
          : 'REWRITE',
      admitted: admittedCompression.has(index),
    });
  }
  return collected;
}

/** What the model itself changed — the number this harness exists to move. */
const modelChanges = collectChanges(fromModel);
/** What ships, model and mechanical rules together. */
const changes = collectChanges(after);

const rewrites = modelChanges.filter((c) => c.verdict === 'REWRITE');
const unadmitted = rewrites.filter((c) => !c.admitted);
/** Lines the model was actually asked about: the ones over the budget. */
const sourceOverLong = [...before].filter(([, body]) =>
  body.split('\n').some((line) => visibleLength(line) > LANG.lineMaxChars),
);
const overLong = [...after].filter(([, body]) =>
  body.split('\n').some((line) => visibleLength(line) > LANG.lineMaxChars),
);

const seconds = (Date.now() - startedAt) / 1000;

mkdirSync(P.out, { recursive: true });
const stem = path.basename(P.file).replace(/\.srt$/i, '');
const srtPath = path.join(P.out, `${stem}.polished.srt`);
const reportPath = path.join(P.out, `${stem}.report.md`);
writeFileSync(srtPath, polished);

writeFileSync(
  reportPath,
  [
    `# 스타일 교정 리포트 — ${stem}`,
    '',
    `- 파일: \`${P.file}\` · 모델: \`${P.model}\``,
    `- 블록 ${before.size}개(청크 ${sourceChunks.length}) · ${seconds.toFixed(1)}s · API실패 ${apiFailures}`,
    `- **채점 대상 ${before.size - unscored.size}블록** (모델이 답하지 않은 ${unscored.size}블록은 제외 — 원문 폴백이라 모델을 평가할 수 없다)`,
    '',
    `- **모델이 바꾼 것: ${modelChanges.length}블록** ` +
      `= FORMAT ${modelChanges.length - rewrites.length} / ⚠ REWRITE ${rewrites.length}` +
      ` (그중 압축했다고 보고한 것 ${rewrites.length - unadmitted.length})`,
    `- 코드가 바꾼 것: 줄접기 ${textRuleReport.linesJoined} · 줄끝부호 ${textRuleReport.trailingPunctuationStripped} · 줄중간마침표→쉼표 ${textRuleReport.midLinePeriodsToCommas} · 3줄초과 ${textRuleReport.linesMerged}`,
    `- 둘을 합친 최종 변경: ${changes.length}블록`,
    '',
    `- 모델에게 실제로 일이 있었던 블록(원본이 ${LANG.lineMaxChars}자 초과): **${sourceOverLong.length}**`,
    `- 교정 후에도 ${LANG.lineMaxChars}자를 넘는 블록: ${overLong.length}`,
    '',
    '**모델 변경 0 + 원본 초과 0 = 고칠 게 없었다는 뜻이지 모델이 실패했다는 뜻이 아니다.**',
    '모델의 줄바꿈 실력을 재려면 원본 초과가 있는 파일로 돌려야 한다.',
    '',
    '**⚠ REWRITE = 공백·줄바꿈·문장부호를 빼고 비교해도 글자가 달라진 블록.**',
    '형식만 교정하라고 했으므로, 압축으로 보고되지 않은 REWRITE는 프롬프트 위반이다.',
    `그 수가 이 하네스의 점수다 — 지금 **${unadmitted.length}건**.`,
    '',
    '---',
    '',
    '## 모델이 바꾼 블록',
    '',
    ...modelChanges.flatMap((c) => [
      `### ${c.index} · ${c.verdict}${c.admitted ? ' (압축 보고됨)' : ''}`,
      `- before: ${c.before.replace(/\n/g, ' / ')}`,
      `- after:  ${c.after.replace(/\n/g, ' / ')}`,
      '',
    ]),
  ].join('\n'),
);

console.log(
  [
    '',
    `블록 ${before.size} (채점 ${before.size - unscored.size}) · 원본 ${LANG.lineMaxChars}자 초과 ${sourceOverLong.length}`,
    `모델 변경 ${modelChanges.length} ` +
      `(FORMAT ${modelChanges.length - rewrites.length} / ⚠ REWRITE ${rewrites.length}, ` +
      `보고되지 않은 REWRITE ${unadmitted.length})`,
    `코드 변경 줄접기 ${textRuleReport.linesJoined} / 줄끝부호 ${textRuleReport.trailingPunctuationStripped} / 마침표→쉼표 ${textRuleReport.midLinePeriodsToCommas} · 최종 변경 ${changes.length}`,
    `${LANG.lineMaxChars}자 초과 잔존 ${overLong.length} · API실패 ${apiFailures} · ${seconds.toFixed(1)}s`,
    `→ ${srtPath}`,
    `→ ${reportPath}`,
  ].join('\n'),
);
