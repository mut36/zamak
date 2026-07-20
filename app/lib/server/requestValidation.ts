import 'server-only';

import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  type AllowedModel,
} from '../../config/constants';
import type {
  ChunkTranslationRequest,
  MovieInfo,
  TranslationStyle,
} from '../../types/translation';

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
    // The job this chunk was paid for; validated against the caller's own
    // rows before any model call happens.
    jobId: requireString(value, 'jobId'),
  };
}
