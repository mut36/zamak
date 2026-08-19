#!/usr/bin/env node
// 검수 패스 하네스 — 이미 번역이 끝난 한국어 자막을 모델에게 한 번 더 읽히고,
// 그 패스가 실익이 있는지 재는 도구. 설계는
// `docs/superpowers/specs/2026-08-19-review-pass-harness-design.md`.
//
//   npm run review -- translated=.harness/full-movie.meaning.srt limit=3
//   npm run review -- translated=.harness/x.srt source=samples/subtitles/x.srt
//
// 1차 번역은 이 스크립트가 안 돌린다 — `npm run harness`로 뽑은 결과를 받는다.
// 그래야 번역을 다시 안 돌리고 검수 프롬프트만 여러 번 실험할 수 있다.
//
// ⚠️ 검수 모델은 **원문을 보지 않는다**(스펙 §3). 원문을 얹으면 입력이 2배가 되고
// Pro HIGH thinking에서 검수 원가가 Pro 단독 번역에 근접해 가설 자체가 무너진다.
// 대신 `source=`를 주면 **리포트에만** 원문 열이 붙어, 원문 없이 다듬을 때 생기는
// "없던 오역"을 사람이 그 자리에서 잡을 수 있다.
//
// 번역 하네스(prompt-ab.mts)·교정 하네스(polish.mts)와 같은 자리에서 산다:
// Gemini 프로바이더를 직접 불러 로그인·크레딧·dev 서버 없이 돌지만 **실제 API
// 비용이 나간다**. 파라미터는 전부 key=value.
//
// 이 도구는 프로덕션 경로가 아니다 — 프롬프트도 `scripts/prompts/` 아래에 따로 두어
// `npm run check:tokens`가 재는 프로덕션 프롬프트 예산에 섞이지 않게 했다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  parseSrtBlocks,
  chunkSrtBlocksAtGaps,
  computeCps,
  enforceTextRules,
  formatBlocksForModel,
  reassembleTranslatedChunk,
} from '../app/lib/srt';
import { geminiProvider } from '../app/lib/providers/gemini';
import type { TokenUsage } from '../app/lib/providers/types';
import { runOrderedPool } from '../app/lib/client/concurrency';
import { resolveTargetLang } from '../app/config/languages';
import {
  PRO_MODEL,
  SERVER_CONCURRENCY,
  chunkSizeForModel,
  getReadingSpeed,
  thinkingLevelForModel,
} from '../app/config/constants';
import { bodiesByIndex, visibleLength } from './harness/blocks';

// ---------- parameters ----------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((pair) => {
    const at = pair.indexOf('=');
    return at === -1 ? [pair, 'true'] : [pair.slice(0, at), pair.slice(at + 1)];
  }),
) as Record<string, string>;

if (!args.translated) {
  console.log(
    'translated=<1차 번역 SRT 경로>가 필요하다. 예:\n' +
      '  npm run review -- translated=.harness/full-movie.meaning.srt limit=3',
  );
  process.exit(1);
}

const P = {
  /** The pass-1 output being reviewed. Required — this harness never translates. */
  translated: args.translated,
  /**
   * Original-language SRT. Never sent to the model; joined by sequence number
   * into the report so a human can see what the line was supposed to say.
   */
  source: args.source ?? '',
  /** Cap on chunks — keeps a smoke run cheap. 0 = all. */
  limit: Number(args.limit ?? 0),
  out: args.out ?? '.review',
  lang: args.lang ?? 'ko',
  /** Reading-speed profile for the CPS count — display only, nothing is retimed. */
  profile: args.profile ?? 'movie',
  /**
   * Reviewing is the expensive model's job in this experiment, so the default
   * is Pro rather than whatever production translates with. The provider is
   * called directly, so this is not limited to `ALLOWED_MODELS` (which gates
   * what users may pick, not what we may test).
   */
  model: args.model ?? PRO_MODEL,
  /** Pro pricing per 1M tokens (docs/tuning/cost-per-block.md §1). */
  pin: Number(args.pin ?? 2.0),
  pout: Number(args.pout ?? 12.0),
};

const P_CHUNK = Number(args.chunk ?? chunkSizeForModel(P.model));

/**
 * Thinking tokens below which a reply is treated as the model having skipped
 * the chunk rather than having found nothing to fix.
 *
 * Two full runs each had one chunk come back `thinking=0 · output=1 (NONE)`,
 * and they were *different* chunks — the 2nd run's silent chunk was the very
 * range where the 1st run found 15 fixes (docs/tuning/review-pass.md §10). So
 * a zero-thought NONE is laziness, not a clean stretch, and sparse output has
 * no other way to tell the two apart: a legitimate NONE and a skipped chunk are
 * byte-identical.
 *
 * Pro never reports zero thoughts when it actually works — even at LOW
 * (docs/decisions.md §2-4-1), and the working chunks measured 923–7,968. The
 * signal only separates cleanly on that model, so the guard is off by default
 * elsewhere. `minThinking=0` disables it.
 */
const P_MIN_THINKING = Number(args.minThinking ?? (P.model === PRO_MODEL ? 1 : 0));

/** Actual billed amount ÷ computed USD, verified on two card charges. */
const KRW_PER_USD = 1688;

const LANG = resolveTargetLang(P.lang);
const READING = getReadingSpeed(P.lang, P.profile);
const PROMPT_PATH = path.join(import.meta.dirname, 'prompts/review_ko.txt');

// ---------- prompt --------------------------------------------------------

/**
 * The reply when the model found nothing to fix. It is a normal, good outcome —
 * not a failure — but it must never reach the reassembler as subtitle text.
 */
const NONE_LINE = /^\s*NONE\s*$/gim;

function buildSystemPrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8').replaceAll(
    '{{lineMaxChars}}',
    String(LANG.lineMaxChars),
  );
}

// ---------- scoring -------------------------------------------------------

/**
 * Digits and Latin words, as a set. The model is told never to touch a number
 * or a proper noun, and without the source text this comparison is the only
 * check on that promise a machine can make: `1999 → 1998` and `Marco → Mario`
 * both show up here, while an ordinary rewording does not.
 *
 * Korean-transliterated names slip through — those are the human diff's job.
 */
function factSignature(body: string): string {
  const facts = body.match(/\d+|[A-Za-z][A-Za-z'’-]*/g) ?? [];
  return [...facts].sort().join('|').toLowerCase();
}

function isOverLong(body: string): boolean {
  return body.split('\n').some((line) => visibleLength(line) > LANG.lineMaxChars);
}

/** Sequence numbers whose CPS exceeds the profile's hard max. */
function cpsViolations(srt: string): Set<number> {
  const over = new Set<number>();
  for (const raw of parseSrtBlocks(srt)) {
    const seq = Number(raw.split('\n')[0]?.trim());
    if (!Number.isInteger(seq)) continue;
    const measured = computeCps(raw);
    if (measured?.cps != null && measured.cps > READING.cpsHardMax) over.add(seq);
  }
  return over;
}

/**
 * How much shorter the review made a block, as a fraction of the original.
 *
 * Compression is a legitimate fix (rule 2 asks for it on over-long lines), but
 * a *large* drop is how text loss looks from the outside: in the first full run
 * the model returned only the second line of a two-line subtitle twice, silently
 * deleting the first. Nothing else caught it — the discarded halves held no
 * numbers and no Latin words, so the tamper check saw a clean rewording.
 */
function shrinkRatio(before: string, after: string): number {
  const from = visibleLength(before.replace(/\n/g, ''));
  if (from === 0) return 0;
  return 1 - visibleLength(after.replace(/\n/g, '')) / from;
}

/**
 * Losing this share of a block's characters is treated as suspected text loss.
 * A genuine compression of an over-long line trims a few characters; dropping a
 * line of a two-line subtitle halves it. 0.4 sits between the two.
 */
const SHRINK_ALARM = 0.4;

interface Change {
  index: number;
  before: string;
  after: string;
  /** Numbers or Latin words differ — the model broke a promise it was given. */
  tampered: boolean;
  /** Lost {SHRINK_ALARM} or more of its characters — suspected dropped line. */
  shrunk: boolean;
  beforeOverLong: boolean;
  afterOverLong: boolean;
}

// ---------- run -----------------------------------------------------------

const translatedSrt = readFileSync(path.resolve(P.translated), 'utf8').replace(
  /^﻿/,
  '',
);
const blocks = parseSrtBlocks(translatedSrt);
if (blocks.length === 0) {
  console.log(`${P.translated} is empty — 1차 번역 SRT를 넘겼는지 확인할 것.`);
  process.exit(1);
}

const sourceBodies = P.source
  ? bodiesByIndex(readFileSync(path.resolve(P.source), 'utf8').replace(/^﻿/, ''))
  : new Map<number, string>();

let sourceChunks = chunkSrtBlocksAtGaps(blocks, P_CHUNK);
if (P.limit > 0) sourceChunks = sourceChunks.slice(0, P.limit);

const system = buildSystemPrompt();

console.log(
  `review: ${blocks.length} blocks → ${sourceChunks.length} chunks ` +
    `(size ${P_CHUNK}, concurrency ${SERVER_CONCURRENCY}), model ${P.model} ` +
    `thinking ${thinkingLevelForModel(P.model)}`,
);

const startedAt = Date.now();
let apiFailures = 0;
/** Replies rejected as skipped work and re-requested (see P_MIN_THINKING). */
let lazyRetries = 0;
/** Blocks in a chunk the model never answered for — excluded from the score. */
const unscored = new Set<number>();
/** How many blocks the model chose to emit, before checking whether they differ. */
let emitted = 0;
const usageTotal: TokenUsage = { prompt: 0, cached: 0, thoughts: 0, output: 0 };

const ATTEMPTS = 3;

const reviewedChunks = await runOrderedPool<string, string>({
  items: sourceChunks,
  concurrency: SERVER_CONCURRENCY,
  signal: new AbortController().signal,
  worker: async (chunk, index) => {
    const user =
      `<subtitle_data>\n${formatBlocksForModel(chunk)}\n</subtitle_data>\n\n` +
      '고칠 번호만 출력해. 고칠 게 없으면 NONE.';

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const generated = await geminiProvider.generateText({
          model: P.model,
          prompt: user,
          systemInstruction: system,
          translationMode: 'chunk',
        });
        usageTotal.prompt += generated.usage.prompt;
        usageTotal.cached += generated.usage.cached;
        usageTotal.thoughts += generated.usage.thoughts;
        usageTotal.output += generated.usage.output;

        // The chunk was skipped, not reviewed — ask again rather than bank a
        // silent pass. The retry is billed, but it lands only on the chunks
        // that did nothing, so the cost rides on the failure rate.
        if (generated.usage.thoughts < P_MIN_THINKING && attempt < ATTEMPTS) {
          lazyRetries++;
          console.log(
            `  chunk ${index + 1} attempt ${attempt}/${ATTEMPTS} thinking=${generated.usage.thoughts} — 건너뛴 것으로 보고 재요청`,
          );
          continue;
        }

        const body = generated.text.replace(NONE_LINE, '').trim();
        // A reply of NONE leaves nothing to reassemble, and the reassembler
        // would report every block as unmatched — which is exactly right here
        // (unmatched = keep pass 1) but noisy to log as a near-miss.
        const rebuilt = reassembleTranslatedChunk(chunk, body);
        emitted += rebuilt.matched;
        console.log(
          `  chunk ${index + 1}/${sourceChunks.length} · ${rebuilt.matched}/${rebuilt.total} 고침`,
        );
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
          return chunk; // keep pass 1, same as production's fallback
        }
      }
    }
    return chunk;
  },
});

/** Straight from the model, before any mechanical rule touches it. */
const modelOutput = reviewedChunks.join('\n\n');

// The same mechanical rules production applies. Keeping both strings is what
// lets the report name the author of each change: without it, a run where the
// model did nothing is indistinguishable from one where it worked, because
// `enforceTextRules` reformats the untouched text just the same.
const { content: reviewed, report: textRuleReport } = enforceTextRules(modelOutput, {
  trailingPunctuation: LANG.trailingPunctuation,
  lineMaxChars: LANG.lineMaxChars,
  ellipsis: LANG.ellipsis,
});

// ---------- report --------------------------------------------------------

const scopedPassOne = sourceChunks.join('\n\n');
const before = bodiesByIndex(scopedPassOne);
const fromModel = bodiesByIndex(modelOutput);
const after = bodiesByIndex(reviewed);

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
      tampered: factSignature(beforeBody) !== factSignature(afterBody),
      shrunk: shrinkRatio(beforeBody, afterBody) >= SHRINK_ALARM,
      beforeOverLong: isOverLong(beforeBody),
      afterOverLong: isOverLong(afterBody),
    });
  }
  return collected;
}

/** What the model itself changed — the number this harness exists to move. */
const modelChanges = collectChanges(fromModel);
/** What ships, model and mechanical rules together. */
const changes = collectChanges(after);
const tampered = modelChanges.filter((c) => c.tampered);
const shrunk = modelChanges.filter((c) => c.shrunk);
/** Either alarm — these are the blocks a human must read first. */
const suspect = modelChanges.filter((c) => c.tampered || c.shrunk);

const scored = before.size - unscored.size;
const overLongBefore = [...before].filter(([, body]) => isOverLong(body));
const overLongAfter = [...after].filter(([, body]) => isOverLong(body));
const cpsBefore = cpsViolations(scopedPassOne);
const cpsAfter = cpsViolations(reviewed);

const billedOut = usageTotal.thoughts + usageTotal.output;
const usd = (usageTotal.prompt * P.pin + billedOut * P.pout) / 1_000_000;
const krw = usd * KRW_PER_USD;
const krwPerBlock = scored > 0 ? krw / scored : 0;
const seconds = (Date.now() - startedAt) / 1000;

mkdirSync(P.out, { recursive: true });
const stem = path.basename(P.translated).replace(/\.srt$/i, '');
const srtPath = path.join(P.out, `${stem}.reviewed.srt`);
const reportPath = path.join(P.out, `${stem}.review-report.md`);
writeFileSync(srtPath, reviewed);

function diffEntry(c: Change): string[] {
  const flags = [
    c.tampered ? '⚠숫자·고유명사 변조' : '',
    c.shrunk ? '⚠텍스트 유실 의심' : '',
    c.beforeOverLong && !c.afterOverLong ? `자수 해소` : '',
    !c.beforeOverLong && c.afterOverLong ? '⚠자수 초과 발생' : '',
  ].filter(Boolean);
  const lines = [`### ${c.index}${flags.length ? ` · ${flags.join(' · ')}` : ''}`];
  const original = sourceBodies.get(c.index);
  if (original !== undefined) lines.push(`- 원문: ${original.replace(/\n/g, ' / ')}`);
  lines.push(`- 1차:  ${c.before.replace(/\n/g, ' / ')}`);
  lines.push(`- 검수: ${c.after.replace(/\n/g, ' / ')}`);
  // The diff lists what the *model* produced, but `enforceTextRules` runs after
  // it — a third line gets folded back, a trailing period gets stripped. Where
  // the two differ, the model's line alone would show a text that never ships.
  const shipped = after.get(c.index);
  if (shipped !== undefined && shipped !== c.after) {
    lines.push(`- 출고: ${shipped.replace(/\n/g, ' / ')}  ← 코드가 더 손봄`);
  }
  lines.push('');
  return lines;
}

writeFileSync(
  reportPath,
  [
    `# 검수 패스 리포트 — ${stem}`,
    '',
    `- 1차 번역: \`${P.translated}\`${P.source ? ` · 원문: \`${P.source}\`` : ''}`,
    `- 검수 모델: \`${P.model}\` · thinking \`${thinkingLevelForModel(P.model)}\` · 청크 ${P_CHUNK}`,
    `- 블록 ${before.size}개(청크 ${sourceChunks.length}) · ${seconds.toFixed(1)}s · API실패 ${apiFailures} · 게으름 재요청 ${lazyRetries}회 (thinking < ${P_MIN_THINKING})`,
    `- **채점 대상 ${scored}블록** (모델이 답하지 않은 ${unscored.size}블록은 제외 — 1차 폴백이라 모델을 평가할 수 없다)`,
    '',
    '## 비용',
    '',
    `- 입력 ${usageTotal.prompt.toLocaleString()} · thinking ${usageTotal.thoughts.toLocaleString()} · 출력 ${usageTotal.output.toLocaleString()} 토큰`,
    `- $${usd.toFixed(4)} = **${krw.toFixed(0)}원** · **블록당 ${krwPerBlock.toFixed(3)}원**`,
    `- 비교 기준(\`tuning/cost-per-block.md\`): flash 1차 0.23원/블록 · Pro 단독 1.34원/블록`,
    `- → **1차(flash) + 이 검수 = ${(0.23 + krwPerBlock).toFixed(3)}원/블록**`,
    '',
    '## 모델이 한 일',
    '',
    `- 모델이 내보낸 블록 ${emitted} → 그중 **실제로 달라진 것 ${modelChanges.length}** ` +
      `(${scored > 0 ? ((modelChanges.length / scored) * 100).toFixed(1) : '0'}%)`,
    `- ⚠ **숫자·고유명사 변조 ${tampered.length}건** · ⚠ **텍스트 유실 의심 ${shrunk.length}건** (글자 ${SHRINK_ALARM * 100}% 이상 감소)`,
    `- 코드가 바꾼 것: 줄접기 ${textRuleReport.linesJoined} · 줄끝부호 ${textRuleReport.trailingPunctuationStripped} · 마침표→쉼표 ${textRuleReport.midLinePeriodsToCommas} · 3줄초과 ${textRuleReport.linesMerged} · 화자분리 ${textRuleReport.speakerLinesSplit}`,
    `- 둘을 합친 최종 변경: ${changes.length}블록`,
    '',
    '## 형식 지표',
    '',
    `- ${LANG.lineMaxChars}자 초과 블록: ${overLongBefore.length} → **${overLongAfter.length}**`,
    `- CPS ${READING.cpsHardMax} 초과 블록(${P.profile}): ${cpsBefore.size} → **${cpsAfter.size}** (타임코드는 안 건드렸으므로 순수 글자 수 효과)`,
    '',
    '---',
    '',
    '**출력이 희소한 패스라 "고침 0"은 실패가 아니라 고칠 게 없었다는 뜻이다.**',
    '모델이 안 내보낸 번호는 1차 번역이 그대로 남는다 — 그게 이 설계의 안전 폴백이다.',
    '',
    '**⚠ 두 경보 = 원문 없이 다듬을 때의 핵심 위험이 실제로 터진 자리.**',
    '변조는 모델이 숫자·고유명사를 건드린 것, 유실 의심은 두 줄짜리 자막의 한 줄을',
    '통째로 버린 것(2026-08-19 첫 전편 런에서 2건 관측). 0이 아니면 프로덕션 배선',
    '전에 프롬프트부터 고칠 것.',
    '',
    '**개선인지 개악인지는 아래 diff를 사람이 읽어서 판정한다.** 기계는 형식과 비용만 잰다.',
    '',
    '---',
    '',
    '## 모델이 바꾼 블록',
    '',
    ...(suspect.length > 0
      ? ['### ⚠ 의심 블록부터', '', ...suspect.flatMap(diffEntry), '### 나머지', '']
      : []),
    ...modelChanges.filter((c) => !c.tampered && !c.shrunk).flatMap(diffEntry),
  ].join('\n'),
);

console.log(
  [
    '',
    `블록 ${before.size} (채점 ${scored}) · 모델 내보냄 ${emitted} → 실제 변경 ${modelChanges.length}`,
    `⚠ 숫자·고유명사 변조 ${tampered.length} · ⚠ 텍스트 유실 의심 ${shrunk.length}`,
    `${LANG.lineMaxChars}자 초과 ${overLongBefore.length} → ${overLongAfter.length} · CPS 위반 ${cpsBefore.size} → ${cpsAfter.size}`,
    `비용 ${krw.toFixed(0)}원 (블록당 ${krwPerBlock.toFixed(3)}원) · flash 1차와 합쳐 ${(0.23 + krwPerBlock).toFixed(3)}원/블록 vs Pro 단독 1.34원`,
    `API실패 ${apiFailures} · 게으름 재요청 ${lazyRetries} · ${seconds.toFixed(1)}s`,
    `→ ${srtPath}`,
    `→ ${reportPath}`,
  ].join('\n'),
);
