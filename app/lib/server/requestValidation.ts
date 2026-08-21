import 'server-only';

import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  GLOSSARY_MAX_RELATIONS,
  GLOSSARY_MAX_TERMS,
  type AllowedModel,
} from '../../config/constants';
import type {
  ChunkTranslationRequest,
  MovieInfo,
  TranslationStyle,
} from '../../types/translation';
import type { CastSheet, GlossaryTerm, SpeechRelation } from '../../types/glossary';
import { SPEECH_FORMALITIES, type SpeechFormality } from '../../types/glossary';
import {
  DEFAULT_TARGET_LANG,
  getEnabledTargetLang,
} from '../../config/languages';

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  options: { allowEmpty?: boolean } = {},
): string {
  const value = record[key];
  if (typeof value !== 'string' || (!options.allowEmpty && !value.trim())) {
    throw new RequestValidationError(`Invalid or missing field: ${key}`);
  }
  return value;
}

/** Returns the string if present & valid, otherwise undefined (optional field). */
function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function parseMovieInfo(value: unknown): MovieInfo {
  if (!isRecord(value)) {
    throw new RequestValidationError('Invalid or missing field: movieInfo');
  }

  return {
    title: requireString(value, 'title', { allowEmpty: true }),
    year: requireString(value, 'year', { allowEmpty: true }),
    notes: requireString(value, 'notes', { allowEmpty: true }),
    // Legacy metadata — optional; the Simple UI no longer sends these.
    genre: optionalString(value, 'genre'),
    country: optionalString(value, 'country'),
    era: optionalString(value, 'era'),
    tone: optionalString(value, 'tone'),
  };
}

function parseModel(value: unknown): AllowedModel {
  if (value === undefined) return DEFAULT_MODEL;
  if (
    typeof value !== 'string' ||
    !ALLOWED_MODELS.includes(value as AllowedModel)
  ) {
    throw new RequestValidationError(`Unsupported model: ${String(value)}`);
  }
  return value as AllowedModel;
}

/**
 * The gate between a request and the prompt builder: only codes that are
 * actually enabled get through, so a stale client (or a hand-rolled request)
 * can never reach translationContent with a language it has no rules for.
 */
function parseTargetLanguage(value: unknown): string {
  if (value === undefined) return DEFAULT_TARGET_LANG;
  if (typeof value !== 'string' || !getEnabledTargetLang(value.trim())) {
    throw new RequestValidationError(`Unsupported target language: ${String(value)}`);
  }
  return value.trim();
}

const TERM_KINDS: GlossaryTerm['kind'][] = ['person', 'place', 'org', 'term'];

/**
 * A client loaded before the multi-language change still sends `ko` /
 * '존댓말' shaped sheets; map them rather than dropping the whole sheet
 * mid-deploy. Removable once no such tab can still be open.
 */
const LEGACY_SPEECH: Record<string, SpeechFormality> = {
  존댓말: 'formal',
  반말: 'informal',
  혼용: 'mixed',
};

function parseFormality(value: unknown): SpeechFormality | null {
  if (typeof value !== 'string') return null;
  if (SPEECH_FORMALITIES.includes(value as SpeechFormality)) {
    return value as SpeechFormality;
  }
  return LEGACY_SPEECH[value] ?? null;
}

function parseGlossaryTerm(value: unknown): GlossaryTerm | null {
  if (!isRecord(value)) return null;
  const source = typeof value.source === 'string' ? value.source.trim() : '';
  const rawTarget = typeof value.target === 'string' ? value.target : value.ko;
  const target = typeof rawTarget === 'string' ? rawTarget.trim() : '';
  if (!source || !target) return null;
  const kind = TERM_KINDS.includes(value.kind as GlossaryTerm['kind'])
    ? (value.kind as GlossaryTerm['kind'])
    : 'term';
  const note = typeof value.note === 'string' ? value.note.trim() : undefined;
  return note ? { source, target, kind, note } : { source, target, kind };
}

function parseSpeechRelation(value: unknown): SpeechRelation | null {
  if (!isRecord(value)) return null;
  const from = typeof value.from === 'string' ? value.from.trim() : '';
  const to = typeof value.to === 'string' ? value.to.trim() : '';
  const speech = parseFormality(value.speech);
  const fromBlock = value.fromBlock;
  const toBlock = value.toBlock;
  if (
    !from ||
    !to ||
    !speech ||
    !Number.isInteger(fromBlock) ||
    !Number.isInteger(toBlock) ||
    (fromBlock as number) < 1 ||
    (toBlock as number) < (fromBlock as number)
  ) {
    return null;
  }
  const basis = typeof value.basis === 'string' ? value.basis.trim() : undefined;
  return basis
    ? { from, to, speech, basis, fromBlock: fromBlock as number, toBlock: toBlock as number }
    : { from, to, speech, fromBlock: fromBlock as number, toBlock: toBlock as number };
}

/**
 * Re-validated here even though extractCastSheet.ts already sanitizes its own
 * output: this sheet arrives back from the client (possibly user-edited in
 * the settings screen), so the same size caps apply again — a client bug or a
 * tampered request must not turn into an unbounded per-chunk prompt.
 *
 * 화자·청자 규칙도 여기서 다시 건다. `sanitizeCastSheet`는 `kind === 'person'`인
 * term만 from/to로 허용하는데(2026-07-28 도시가 화자로 앉던 버그의 방어선),
 * 사람 손을 거친 시트에만 그 규칙이 없으면 **모델은 막고 사람은 안 막는**
 * 비대칭이 남는다 — 같은 버그가 편집 경로로 되돌아온다.
 */
function parseCastSheet(value: unknown): CastSheet | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;

  const terms = (Array.isArray(value.terms) ? value.terms : [])
    .map(parseGlossaryTerm)
    .filter((t): t is GlossaryTerm => t !== null)
    .slice(0, GLOSSARY_MAX_TERMS);

  const speakers = new Set(
    terms.filter((t) => t.kind === 'person').map((t) => t.target),
  );

  const relations = (Array.isArray(value.relations) ? value.relations : [])
    .map(parseSpeechRelation)
    .filter((r): r is SpeechRelation => r !== null)
    .filter((r) => speakers.has(r.from) && speakers.has(r.to))
    .slice(0, GLOSSARY_MAX_RELATIONS);

  return { terms, relations };
}

function parseTranslationStyle(value: unknown): 'meaning' | 'cinematic' {
  if (value === undefined) return 'meaning';
  if (value !== 'meaning' && value !== 'cinematic') {
    throw new RequestValidationError('Invalid translation style');
  }
  return value;
}

export function parseChunkTranslationRequest(
  value: unknown,
): ChunkTranslationRequest & {
  model: AllowedModel;
  targetLang: string;
  translationStyle: TranslationStyle;
  jobId: string;
  castSheet?: CastSheet;
} {
  if (!isRecord(value)) throw new RequestValidationError('Invalid JSON body');

  const chunkIndex = value.chunkIndex;
  const totalChunks = value.totalChunks;
  if (
    !Number.isInteger(chunkIndex) ||
    !Number.isInteger(totalChunks) ||
    (chunkIndex as number) < 1 ||
    (totalChunks as number) < (chunkIndex as number)
  ) {
    throw new RequestValidationError('Invalid chunk position');
  }

  return {
    chunk: requireString(value, 'chunk'),
    chunkIndex: chunkIndex as number,
    totalChunks: totalChunks as number,
    // Measurement label, not a control: an unknown value falls back to 'main'
    // rather than rejecting a translation the user already paid for.
    phase: value.phase === 'sweep' ? 'sweep' : 'main',
    movieInfo: parseMovieInfo(value.movieInfo),
    model: parseModel(value.model),
    targetLang: parseTargetLanguage(value.targetLang),
    translationStyle: parseTranslationStyle(value.translationStyle),
    castSheet: parseCastSheet(value.castSheet),
    // The job this chunk was paid for; validated against the caller's own
    // rows before any model call happens.
    jobId: requireString(value, 'jobId'),
  };
}
