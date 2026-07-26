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

function parseTargetLanguage(value: unknown): string {
  if (value === undefined) return 'ko';
  if (typeof value !== 'string' || !value.trim() || value.length > 50) {
    throw new RequestValidationError('Invalid target language');
  }
  return value.trim();
}

const TERM_KINDS: GlossaryTerm['kind'][] = ['person', 'place', 'org', 'term'];
const SPEECH_VALUES: SpeechRelation['speech'][] = ['존댓말', '반말', '혼용'];

function parseGlossaryTerm(value: unknown): GlossaryTerm | null {
  if (!isRecord(value)) return null;
  const source = typeof value.source === 'string' ? value.source.trim() : '';
  const ko = typeof value.ko === 'string' ? value.ko.trim() : '';
  if (!source || !ko) return null;
  const kind = TERM_KINDS.includes(value.kind as GlossaryTerm['kind'])
    ? (value.kind as GlossaryTerm['kind'])
    : 'term';
  const note = typeof value.note === 'string' ? value.note.trim() : undefined;
  return note ? { source, ko, kind, note } : { source, ko, kind };
}

function parseSpeechRelation(value: unknown): SpeechRelation | null {
  if (!isRecord(value)) return null;
  const from = typeof value.from === 'string' ? value.from.trim() : '';
  const to = typeof value.to === 'string' ? value.to.trim() : '';
  const speech = SPEECH_VALUES.includes(value.speech as SpeechRelation['speech'])
    ? (value.speech as SpeechRelation['speech'])
    : null;
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
 * InfoStep), so the same size caps apply again — a client bug or a tampered
 * request must not turn into an unbounded per-chunk prompt.
 */
function parseCastSheet(value: unknown): CastSheet | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;

  const terms = (Array.isArray(value.terms) ? value.terms : [])
    .map(parseGlossaryTerm)
    .filter((t): t is GlossaryTerm => t !== null)
    .slice(0, GLOSSARY_MAX_TERMS);

  const relations = (Array.isArray(value.relations) ? value.relations : [])
    .map(parseSpeechRelation)
    .filter((r): r is SpeechRelation => r !== null)
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
