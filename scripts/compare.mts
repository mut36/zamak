#!/usr/bin/env node
// 두 번역 산출물 나란히 비교 — "어느 경로가 더 나은가"를 사람이 읽고 판정할 수
// 있는 표를 만든다. 설계 배경은 `docs/tuning/review-pass.md` §15.
//
//   npm run compare -- a=.harness/pro/meaning.srt b=.review/full-high/meaning.reviewed.srt \
//                      source=samples/subtitles/full-movie.srt \
//                      labelA="Pro 단독" labelB="flash+Pro검수"
//
// 기계가 답할 수 있는 것(자수·CPS·분량)은 전부 세고, 답할 수 없는 것(번역이 더
// 나은가)은 3열 표로 뽑아 사람에게 넘긴다. 두 경로는 거의 모든 블록에서 문장이
// 다르므로 전량 diff는 읽을 수 없다 — `focus=`로 볼 블록을 고른다.
//
// 모델을 호출하지 않는다. 이미 나와 있는 파일만 읽으므로 API 비용이 없다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { parseSrtBlocks, computeCps } from '../app/lib/srt';
import { resolveTargetLang } from '../app/config/languages';
import { getReadingSpeed } from '../app/config/constants';
import { bodiesByIndex, visibleLength } from './harness/blocks';

// ---------- parameters ----------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

if (!args.a || !args.b) {
  console.log('a=<SRT> b=<SRT> [source=<원문 SRT>] 가 필요하다.');
  process.exit(1);
}

const P = {
  a: args.a,
  b: args.b,
  source: args.source ?? '',
  labelA: args.labelA ?? 'A',
  labelB: args.labelB ?? 'B',
  out: args.out ?? '.compare',
  lang: args.lang ?? 'ko',
  profile: args.profile ?? 'movie',
  /**
   * Which blocks land in the side-by-side table.
   *
   * `diff` — every block where the two paths wrote different text. On two full
   *   translations that is almost the whole file and nobody reads 1,100 rows.
   * `list` — the sequence numbers given in `blocks=`, e.g. the ones a review
   *   pass touched. This is the sharp test: at exactly those lines, what did
   *   the single-model path say?
   * `sample` — every `every=`-th differing block, for an unbiased skim.
   */
  focus: args.focus ?? 'sample',
  blocks: (args.blocks ?? '')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter(Number.isInteger),
  every: Number(args.every ?? 40),
};

const LANG = resolveTargetLang(P.lang);
const READING = getReadingSpeed(P.lang, P.profile);

// ---------- read ----------------------------------------------------------

function read(file: string): string {
  return readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, '');
}

const aBodies = bodiesByIndex(read(P.a));
const bBodies = bodiesByIndex(read(P.b));
const sourceText = P.source ? read(P.source) : '';
const sourceBodies = sourceText ? bodiesByIndex(sourceText) : new Map<number, string>();

/**
 * Block durations taken from the SOURCE file, for both paths alike.
 *
 * The two outputs do not carry comparable timecodes: the translation harness
 * runs `adjustSubtitleTiming` (§9.5) and the review harness does not, so each
 * path's own file would measure a different denominator. Reading speed is a
 * property of the text against a fixed screen time, so both are scored against
 * the timings the subtitles actually shipped with.
 */
const durations = new Map<number, number>();
for (const raw of parseSrtBlocks(sourceText || read(P.a))) {
  const seq = Number(raw.split('\n')[0]?.trim());
  const measured = computeCps(raw);
  if (Number.isInteger(seq) && measured) durations.set(seq, measured.durationMs);
}

// ---------- metrics -------------------------------------------------------

interface Metrics {
  blocks: number;
  chars: number;
  overLong: number;
  twoLine: number;
  cpsViolations: number;
  emptyish: number;
}

function measure(bodies: Map<number, string>): Metrics {
  let chars = 0;
  let overLong = 0;
  let twoLine = 0;
  let cpsViolations = 0;
  let emptyish = 0;

  for (const [seq, body] of bodies) {
    const lines = body.split('\n');
    const visible = visibleLength(body.replace(/\n/g, ''));
    chars += visible;
    if (lines.some((line) => visibleLength(line) > LANG.lineMaxChars)) overLong++;
    if (lines.length >= 2) twoLine++;
    if (visible === 0) emptyish++;

    const ms = durations.get(seq);
    if (ms && ms > 0 && visible / (ms / 1000) > READING.cpsHardMax) cpsViolations++;
  }

  return { blocks: bodies.size, chars, overLong, twoLine, cpsViolations, emptyish };
}

const mA = measure(aBodies);
const mB = measure(bBodies);

/** Sequence numbers where the two paths wrote different text. */
const differing = [...aBodies.keys()]
  .filter((seq) => bBodies.has(seq) && aBodies.get(seq) !== bBodies.get(seq))
  .sort((x, y) => x - y);

let focusBlocks: number[];
if (P.focus === 'list') focusBlocks = P.blocks.filter((n) => aBodies.has(n));
else if (P.focus === 'diff') focusBlocks = differing;
else focusBlocks = differing.filter((_, i) => i % P.every === 0);

// ---------- report --------------------------------------------------------

mkdirSync(P.out, { recursive: true });
const reportPath = path.join(P.out, 'compare.md');

function row(label: string, a: number | string, b: number | string): string {
  return `| ${label} | ${a} | ${b} |`;
}

function sideBySide(seq: number): string[] {
  const lines = [`### ${seq}`];
  const original = sourceBodies.get(seq);
  if (original !== undefined) lines.push(`- 원문: ${original.replace(/\n/g, ' / ')}`);
  lines.push(`- ${P.labelA}: ${(aBodies.get(seq) ?? '').replace(/\n/g, ' / ')}`);
  lines.push(`- ${P.labelB}: ${(bBodies.get(seq) ?? '').replace(/\n/g, ' / ')}`);
  lines.push('');
  return lines;
}

writeFileSync(
  reportPath,
  [
    `# 산출물 비교 — ${P.labelA} vs ${P.labelB}`,
    '',
    `- A \`${P.a}\` = **${P.labelA}**`,
    `- B \`${P.b}\` = **${P.labelB}**`,
    P.source ? `- 원문 \`${P.source}\`` : '',
    '',
    '## 기계 지표',
    '',
    `| | ${P.labelA} | ${P.labelB} |`,
    '|---|---|---|',
    row('블록 수', mA.blocks, mB.blocks),
    row('총 글자 수(태그 제외)', mA.chars.toLocaleString(), mB.chars.toLocaleString()),
    row('블록당 평균 글자', (mA.chars / mA.blocks).toFixed(1), (mB.chars / mB.blocks).toFixed(1)),
    row(`${LANG.lineMaxChars}자 초과 블록`, mA.overLong, mB.overLong),
    row(`CPS ${READING.cpsHardMax} 초과 블록`, mA.cpsViolations, mB.cpsViolations),
    row('2줄 블록', mA.twoLine, mB.twoLine),
    row('빈 블록', mA.emptyish, mB.emptyish),
    '',
    `**두 경로가 다른 문장을 쓴 블록: ${differing.length} / ${mA.blocks}** ` +
      `(${((differing.length / mA.blocks) * 100).toFixed(1)}%)`,
    '',
    '> CPS는 두 산출물 모두 **원문 파일의 타임코드**로 쟀다. 번역 하네스는',
    '> `adjustSubtitleTiming`(§9.5)을 돌리고 검수 하네스는 안 돌려서, 각자의',
    '> 파일에 실린 시간으로 재면 분모가 서로 다른 값이 된다.',
    '',
    '> **기계는 여기까지다.** 어느 쪽 번역이 나은지는 아래 표를 읽고 판정할 것 —',
    '> 자수와 CPS가 같아도 문장의 질은 전혀 다를 수 있다.',
    '',
    '---',
    '',
    `## 나란히 보기 (${P.focus}${P.focus === 'sample' ? `, ${P.every}블록마다` : ''} — ${focusBlocks.length}건)`,
    '',
    ...focusBlocks.flatMap(sideBySide),
  ]
    .filter((line) => line !== '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n'),
);

console.log(
  [
    `${P.labelA}: ${mA.blocks}블록 · ${mA.chars.toLocaleString()}자 · ${LANG.lineMaxChars}자초과 ${mA.overLong} · CPS위반 ${mA.cpsViolations}`,
    `${P.labelB}: ${mB.blocks}블록 · ${mB.chars.toLocaleString()}자 · ${LANG.lineMaxChars}자초과 ${mB.overLong} · CPS위반 ${mB.cpsViolations}`,
    `문장이 다른 블록 ${differing.length}/${mA.blocks} · 표에 실은 것 ${focusBlocks.length}`,
    `→ ${reportPath}`,
  ].join('\n'),
);
