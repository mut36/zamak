import 'server-only';

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  GLOSSARY_MAX_BLOCKS,
  GLOSSARY_MAX_RELATIONS,
  GLOSSARY_MAX_TERMS,
  GLOSSARY_MODEL,
  GLOSSARY_THINKING_LEVEL,
  type GlossaryProvider,
} from '../../config/constants';
import type {
  CastSheet,
  GlossaryTerm,
  NarrationStyle,
  SpeechRelation,
} from '../../types/glossary';
import {
  EMPTY_CAST_SHEET,
  NARRATION_STYLES,
  SPEECH_FORMALITIES,
} from '../../types/glossary';
import type { MovieInfo } from '../../types/translation';
import { resolveTargetLang, type TargetLang } from '../../config/languages';
import { formatBlocksForModel, parseSrtBlocks } from '../srt';
import {
  loadCastSheetExtractionPrompt,
  loadCastSheetFormalityTask,
} from '../prompts/loader';
import { renderPromptTemplate } from '../prompts/renderer';
import { formatMovieInfo } from '../prompts/translationContent';
import { lookupById, searchCandidates, type TmdbCastMember } from './tmdb';

const CAST_SHEET_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    terms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ['person', 'place', 'org', 'term'],
          },
          note: { type: Type.STRING },
        },
        required: ['source', 'target', 'kind'],
        propertyOrdering: ['source', 'target', 'kind', 'note'],
      },
    },
    relations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          speech: { type: Type.STRING, enum: SPEECH_FORMALITIES },
          basis: { type: Type.STRING },
          fromBlock: { type: Type.INTEGER },
          toBlock: { type: Type.INTEGER },
        },
        required: ['from', 'to', 'speech', 'fromBlock', 'toBlock'],
        propertyOrdering: [
          'from',
          'to',
          'speech',
          'basis',
          'fromBlock',
          'toBlock',
        ],
      },
    },
    narration: { type: Type.STRING, enum: NARRATION_STYLES },
  },
  required: ['terms', 'relations', 'narration'],
};

/**
 * Plain JSON Schema for OpenAI Structured Outputs (strict) / Claude tool
 * input. Every property is required and `additionalProperties: false` at
 * every object level — optional fields (note/basis) are always-present
 * strings (empty = absent), which sanitizeCastSheet already treats as absent.
 * Exported so scripts/glossary-ab.mts shares one schema with production.
 */
export const CAST_SHEET_JSON_SCHEMA: Record<string, unknown> = {
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
          speech: { type: 'string', enum: [...SPEECH_FORMALITIES] },
          basis: { type: 'string' },
          fromBlock: { type: 'integer' },
          toBlock: { type: 'integer' },
        },
        required: ['from', 'to', 'speech', 'basis', 'fromBlock', 'toBlock'],
        additionalProperties: false,
      },
    },
    narration: { type: 'string', enum: [...NARRATION_STYLES] },
  },
  required: ['terms', 'relations', 'narration'],
  additionalProperties: false,
};

/**
 * Evenly excerpt blocks across the whole file rather than sampling the lead
 * (unlike /api/summarize): names and relationships are scattered throughout,
 * so a leading-only sample would miss anyone introduced past the opening.
 * `[...]` markers between segments match the extraction prompt's instruction
 * to ignore possible relation changes inside a gap. Original blocks (with
 * their real sequence numbers) pass straight to formatBlocksForModel, so
 * fromBlock/toBlock in the model's answer still refer to real block numbers.
 */
function excerptBlocks(blocks: readonly string[], maxBlocks: number): string {
  if (blocks.length <= maxBlocks) return blocks.join('\n\n');

  // 발췌는 "파일 전체를 보는 프리패스"가 파일 일부를 일부러 안 보는 순간이다.
  // 조용히 일어나면 육안 검수로도 알 수 없으므로 반드시 남긴다.
  console.log(
    `[glossary] excerpted ${blocks.length}→${maxBlocks} blocks (threshold GLOSSARY_MAX_BLOCKS)`,
  );

  const segments = 12;
  const segSize = Math.max(1, Math.floor(maxBlocks / segments));
  const step = blocks.length / segments;

  const picked: string[] = [];
  for (let s = 0; s < segments; s++) {
    const start = Math.floor(s * step);
    const end = Math.min(blocks.length, start + segSize);
    if (end <= start) continue;
    if (picked.length > 0) picked.push('[...]');
    picked.push(...blocks.slice(start, end));
  }
  return picked.join('\n\n');
}

/**
 * Builds the extraction system prompt for one target language: the relations
 * half is injected only when the language has a formality axis, so English or
 * Chinese runs ask for spellings alone instead of inventing an axis their
 * grammar doesn't have.
 *
 * Exported (along with buildUserTurn, sanitizeCastSheet, fetchCastAnchors)
 * so scripts/glossary-ab.mts can run the exact same prompt through
 * non-Gemini providers for an apples-to-apples model comparison — only the
 * API call differs, not the prompt.
 */
export async function buildSystemInstruction(lang: TargetLang): Promise<string> {
  const [template, formalityTemplate] = await Promise.all([
    loadCastSheetExtractionPrompt(),
    lang.formality ? loadCastSheetFormalityTask() : Promise.resolve(''),
  ]);

  const axis = lang.formality;
  const formalityTask = axis
    ? `\n${renderPromptTemplate(formalityTemplate, {
        targetLanguage: lang.promptLabel,
        formalLabel: axis.formal,
        informalLabel: axis.informal,
        mixedLabel: axis.mixed,
      })}\n`
    : `\n[할 일 2 — 말투 관계표(relations)]\n- ${lang.promptLabel}에는 상대에 따라 달라지는 문법적 말투 축이 없다. relations는 빈 배열로 둬.\n`;

  return renderPromptTemplate(template, {
    targetLanguage: lang.promptLabel,
    formalityTask,
  });
}

/**
 * TMDB rarely localizes `character`, so this is not a ready-made spelling —
 * just a hint the extraction prompt uses to identify who's who ("this
 * character, played by this actor, is probably in the subtitles"). The model
 * still does the actual target-language spelling work.
 */
function buildCastAnchorTag(cast: readonly TmdbCastMember[]): string {
  if (cast.length === 0) return '';
  const lines = cast.map((c) => `- ${c.character} (배우: ${c.actor})`);
  return `<tmdb_cast>\n${lines.join('\n')}\n</tmdb_cast>`;
}

/**
 * Best-effort TMDB cast lookup for the anchor tag. A second TMDB call
 * (enrichMovie.ts already made one for /api/enrich) rather than threading the
 * result through the client — keeps this prepass self-contained and able to
 * run standalone. Failures (no TMDB key, no match, network error) degrade to
 * no anchor, same as every other best-effort path in this feature.
 */
export async function fetchCastAnchors(
  title: string,
  year: string,
): Promise<TmdbCastMember[]> {
  if (!title.trim()) return [];
  try {
    const candidates = await searchCandidates(title, year);
    if (candidates.length === 0) return [];
    const best = candidates[0];
    const result = await lookupById(best.mediaType, best.tmdbId);
    return result.found ? (result.cast ?? []) : [];
  } catch (error) {
    console.error('[glossary] TMDB cast lookup failed', error);
    return [];
  }
}

export function buildUserTurn(
  movieInfo: Pick<MovieInfo, 'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'>,
  cast: readonly TmdbCastMember[],
  subtitleContent: string,
  blockCount: number,
): string {
  const blocks = parseSrtBlocks(subtitleContent);
  const excerpted = excerptBlocks(blocks, GLOSSARY_MAX_BLOCKS);
  const formatted = formatBlocksForModel(excerpted);

  return [
    `<content_metadata>\n${formatMovieInfo(movieInfo)}\n</content_metadata>`,
    buildCastAnchorTag(cast),
    `<subtitle_data>\n${formatted}\n</subtitle_data>`,
    `이 자막의 전체 블록 수: ${blockCount}개 (번호 1~${blockCount}).`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

interface RawCastSheet {
  terms?: unknown;
  relations?: unknown;
  narration?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 라틴 문자·숫자·기본 문장부호로만 이루어진 문자열인지. 이런 source에만 단어
 * 경계를 적용한다 — 한국어·일본어·중국어에는 단어 경계 개념이 없어 경계 검사가
 * 오히려 정상 항목을 떨어뜨린다.
 */
const BOUNDARY_SAFE = /^[\p{Script=Latin}0-9\s'’.,\-()]+$/u;

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 경계 판정이 가능한 source면 그 정규식, 아니면 null(부분문자열로 폴백). */
function boundaryMatcher(needle: string): RegExp | null {
  if (!BOUNDARY_SAFE.test(needle)) return null;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`,
    'gu',
  );
}

/**
 * HALLUCINATION FILTER의 판정부. `includes('Al')`은 "Always" 안에서도 참이라,
 * 모델이 지어낸 짧은 이름이 필터를 통과해 모든 청크의 고정 표기가 될 수 있었다.
 */
function appearsInSource(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const matcher = boundaryMatcher(needle);
  return matcher ? matcher.test(haystack) : haystack.includes(needle);
}

/**
 * 등장 빈도. 정렬에만 쓰지만 `appearsInSource`와 **같은 판정**을 써야 한다 —
 * 다른 규칙을 쓰면 "필터는 통과했는데 0회로 세어지는" 항목이 생긴다.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const matcher = boundaryMatcher(needle);
  if (matcher) return (haystack.match(matcher) ?? []).length;

  let count = 0;
  let index = 0;
  for (;;) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count++;
    index = found + needle.length;
  }
  return count;
}

const TERM_KINDS: GlossaryTerm['kind'][] = ['person', 'place', 'org', 'term'];

/**
 * Post-processing the schema alone can't guarantee: responseSchema forces
 * well-formed JSON, but not truthful content. The single most important check
 * here is the hallucination filter (line below marked HALLUCINATION FILTER) —
 * a made-up name would otherwise pollute the fixed spelling used by every
 * parallel chunk, which is a worse outcome than no glossary at all.
 */
export function sanitizeCastSheet(
  raw: RawCastSheet,
  sourceContent: string,
  blockCount: number,
  hasFormalityAxis: boolean,
): CastSheet {
  const rawTerms = Array.isArray(raw.terms) ? raw.terms : [];
  const seenSource = new Set<string>();

  const candidateTerms = rawTerms
    .filter(isRecord)
    .map((t): GlossaryTerm | null => {
      const source = typeof t.source === 'string' ? t.source.trim() : '';
      const target = typeof t.target === 'string' ? t.target.trim() : '';
      const kind = TERM_KINDS.includes(t.kind as GlossaryTerm['kind'])
        ? (t.kind as GlossaryTerm['kind'])
        : 'term';
      const note = typeof t.note === 'string' ? t.note.trim() : undefined;
      if (!source || !target) return null;
      // HALLUCINATION FILTER: a term the model invented (not present in the
      // actual subtitles) must never become the fixed spelling every chunk is
      // told to use.
      if (!appearsInSource(sourceContent, source)) return null;
      if (seenSource.has(source)) return null;
      seenSource.add(source);
      return note ? { source, target, kind, note } : { source, target, kind };
    })
    .filter((t): t is GlossaryTerm => t !== null);

  const terms = candidateTerms
    .sort(
      (a, b) =>
        countOccurrences(sourceContent, b.source) -
        countOccurrences(sourceContent, a.source),
    )
    .slice(0, GLOSSARY_MAX_TERMS);

  // Only a person can be a speaker or listener — a place/org/term slipping
  // into from/to (e.g. the model picking a city as a speaker) is a prompt
  // failure the schema alone doesn't prevent, so code closes the gap here
  // instead of trusting the model to self-restrict.
  const validTargets = new Set(
    terms.filter((t) => t.kind === 'person').map((t) => t.target),
  );

  // A language with no formality axis has nothing to say here — drop whatever
  // the model produced rather than shipping an axis its grammar lacks.
  const rawRelations =
    hasFormalityAxis && Array.isArray(raw.relations) ? raw.relations : [];
  const targetKind = new Map(terms.map((t) => [t.target, t.kind]));
  let droppedNonPerson = 0;
  const relations = rawRelations
    .filter(isRecord)
    .map((r): SpeechRelation | null => {
      const from = typeof r.from === 'string' ? r.from.trim() : '';
      const to = typeof r.to === 'string' ? r.to.trim() : '';
      const speech = SPEECH_FORMALITIES.includes(
        r.speech as SpeechRelation['speech'],
      )
        ? (r.speech as SpeechRelation['speech'])
        : null;
      const basis = typeof r.basis === 'string' ? r.basis.trim() : undefined;
      const fromBlockRaw = typeof r.fromBlock === 'number' ? r.fromBlock : NaN;
      const toBlockRaw = typeof r.toBlock === 'number' ? r.toBlock : NaN;

      if (!from || !to || !speech) return null;
      if (!validTargets.has(from) || !validTargets.has(to)) {
        // Distinguish "the model named a real non-person term as a speaker"
        // from "the model named something not in terms at all" — only the
        // former is the prompt failure this counter tracks.
        if (
          (targetKind.has(from) && targetKind.get(from) !== 'person') ||
          (targetKind.has(to) && targetKind.get(to) !== 'person')
        ) {
          droppedNonPerson++;
        }
        return null;
      }
      if (!Number.isFinite(fromBlockRaw) || !Number.isFinite(toBlockRaw)) {
        return null;
      }

      const fromBlock = Math.max(1, Math.min(blockCount, Math.round(fromBlockRaw)));
      const toBlock = Math.max(1, Math.min(blockCount, Math.round(toBlockRaw)));
      if (fromBlock > toBlock) return null;

      return basis
        ? { from, to, speech, basis, fromBlock, toBlock }
        : { from, to, speech, fromBlock, toBlock };
    })
    .filter((r): r is SpeechRelation => r !== null)
    .slice(0, GLOSSARY_MAX_RELATIONS);

  if (process.env.GLOSSARY_DEBUG) {
    const kindCounts = TERM_KINDS.map(
      (k) => `${k}=${terms.filter((t) => t.kind === k).length}`,
    ).join(' ');
    console.log(
      `[glossary-sanitize] terms=${terms.length} (${kindCounts}) ` +
        `relations raw=${rawRelations.length} kept=${relations.length} droppedNonPerson=${droppedNonPerson}`,
    );
  }

  // 모르는 값은 'none'으로 떨어뜨린다 — 안 붙는 쪽이 안전하다. 틀린 문체 지정은
  // 파일 전체를 망치지만, 없으면 규칙 파일의 "해요체 금지" 한 줄이 받아준다.
  const narration = NARRATION_STYLES.includes(raw.narration as NarrationStyle)
    ? (raw.narration as NarrationStyle)
    : 'none';

  return { terms, relations, narration };
}

/** Read at call time so harnesses can flip provider after module load. */
function resolveGlossaryProvider(): GlossaryProvider {
  return process.env.GLOSSARY_PROVIDER === 'gemini' ? 'gemini' : 'openai';
}

async function generateViaOpenAi(
  systemInstruction: string,
  userTurn: string,
): Promise<RawCastSheet> {
  const { openaiGenerateJson } = await import('../providers/openai');
  const { json, usage } = await openaiGenerateJson({
    model: GLOSSARY_MODEL,
    system: systemInstruction,
    user: userTurn,
    jsonSchema: CAST_SHEET_JSON_SCHEMA,
    schemaName: 'cast_sheet',
  });
  // Same cost-observation role as the Gemini branch — one call per file.
  console.log(
    `[glossary] provider=openai model=${GLOSSARY_MODEL} prompt=${usage.inputTokens} output=${usage.outputTokens}`,
  );
  return json as RawCastSheet;
}

async function generateViaGemini(
  apiKey: string,
  systemInstruction: string,
  userTurn: string,
): Promise<RawCastSheet> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GLOSSARY_MODEL,
    contents: userTurn,
    config: {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel[GLOSSARY_THINKING_LEVEL],
      },
      responseMimeType: 'application/json',
      responseSchema: CAST_SHEET_SCHEMA,
    },
  });

  const usage = response.usageMetadata;
  console.log(
    `[glossary] provider=gemini model=${GLOSSARY_MODEL} thinking=${GLOSSARY_THINKING_LEVEL} prompt=${usage?.promptTokenCount} thoughts=${usage?.thoughtsTokenCount ?? 0} output=${usage?.candidatesTokenCount}`,
  );

  return JSON.parse(response.text ?? '{}') as RawCastSheet;
}

/**
 * One-shot cast-sheet extraction: a glossary of confirmed name/place/term
 * spellings plus directional speech-formality relations, so parallel chunks
 * agree on both instead of drifting per-chunk. Opt-in (InfoStep toggle,
 * default off) — this never runs unless the user turns it on.
 *
 * Default provider is OpenAI (GPT-5.6-luna); set `GLOSSARY_PROVIDER=gemini`
 * to roll back. Any failure (missing key, API error, unparseable JSON)
 * returns an empty sheet rather than throwing: this prepass must never
 * block translation.
 */
export async function extractCastSheet(
  subtitleContent: string,
  movieInfo: Pick<MovieInfo, 'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'>,
  targetLang: string,
): Promise<CastSheet> {
  const blockCount = parseSrtBlocks(subtitleContent).length;
  if (blockCount === 0) return EMPTY_CAST_SHEET;

  const provider = resolveGlossaryProvider();

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        '[glossary] OPENAI_API_KEY not configured — returning empty cast sheet (provider=openai)',
      );
      return EMPTY_CAST_SHEET;
    }
  } else if (!process.env.GOOGLE_GENAI_API_KEY) {
    console.warn(
      '[glossary] GOOGLE_GENAI_API_KEY not configured — returning empty cast sheet (provider=gemini)',
    );
    return EMPTY_CAST_SHEET;
  }

  const lang = resolveTargetLang(targetLang);

  try {
    const [systemInstruction, cast] = await Promise.all([
      buildSystemInstruction(lang),
      fetchCastAnchors(movieInfo.title, movieInfo.year),
    ]);
    const userTurn = buildUserTurn(movieInfo, cast, subtitleContent, blockCount);

    const parsed =
      provider === 'openai'
        ? await generateViaOpenAi(systemInstruction, userTurn)
        : await generateViaGemini(
            process.env.GOOGLE_GENAI_API_KEY!,
            systemInstruction,
            userTurn,
          );

    return sanitizeCastSheet(
      parsed,
      subtitleContent,
      blockCount,
      lang.formality !== null,
    );
  } catch (error) {
    console.error('[glossary] cast sheet extraction failed', error);
    return EMPTY_CAST_SHEET;
  }
}
