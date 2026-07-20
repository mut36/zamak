import 'server-only';

import { RETRY } from '../../config/constants';
import { parseSrtBlocks, reassembleTranslatedChunk } from '../srt';
import { composeTranslationPrompt } from '../prompts/composer';
import {
  generateModelText,
  getModelProvider,
  type ProviderApiKeys,
} from '../providers';
import type {
  MovieInfo,
  TranslationMode,
  TranslationStyle,
} from '../../types/translation';

interface TranslateOptions {
  model: string;
  movieInfo: MovieInfo;
  targetLanguage: string;
  translationMode: TranslationMode;
  translationStyle: TranslationStyle;
  subtitleContent: string;
  apiKeys?: ProviderApiKeys;
  chunkPosition?: {
    index: number;
    total: number;
  };
}

const SRT_TIMING_PATTERN =
  /^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/;

function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') || message.toLowerCase().includes('quota');
}

/**
 * Strict mode (opt-in, default OFF). When enabled, the model output is
 * validated block-by-block and retried up to RETRY.MAX_ATTEMPTS, and a
 * block-count mismatch triggers per-block re-translation.
 *
 * This is disabled by default because the validation → retry → per-block-split
 * path could balloon a single chunk into hundreds of API calls (20+ min, real
 * money) when the model returns a slightly-off SRT. The default path makes
 * exactly one call per chunk and returns the raw output; the caller keeps the
 * original chunk if that call fails. The strict code is kept, not deleted —
 * flip TRANSLATION_STRICT_MODE=true to re-enable it.
 */
function isStrictModeEnabled(): boolean {
  const setting = process.env.TRANSLATION_STRICT_MODE?.toLowerCase();
  return setting === 'true' || setting === '1';
}

function toUserMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
  }
  const message = error instanceof Error ? error.message : String(error);
  return `번역 중 오류가 발생했습니다: ${message}`;
}

class TranslationOutputValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'empty_response'
      | 'block_count_mismatch'
      | 'invalid_source_block'
      | 'empty_translated_body',
  ) {
    super(message);
    this.name = 'TranslationOutputValidationError';
  }
}

function previewBlock(block: string, maxLength = 240): string {
  const preview = block
    .split('\n')
    .slice(0, 5)
    .join(' / ')
    .replace(/\s+/g, ' ')
    .trim();
  return preview.length > maxLength
    ? `${preview.slice(0, maxLength)}...`
    : preview;
}

function parseSrtBlocksByHeader(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    const nextLine = lines[index + 1]?.trim() ?? '';
    const startsHeader = /^\d+$/.test(line) && SRT_TIMING_PATTERN.test(nextLine);

    if (startsHeader && current.length > 0) {
      blocks.push(current.join('\n').trim());
      current = [];
    }

    current.push(lines[index]);
  }

  if (current.length > 0) {
    const block = current.join('\n').trim();
    if (block) blocks.push(block);
  }

  return blocks.filter(Boolean);
}

function extractSrtBlocksByHeader(content: string): string[] {
  const headerBlocks = parseSrtBlocksByHeader(content);
  return headerBlocks.filter((block) => readHeader(block) !== null);
}

function readHeader(block: string): { sequence: string; timing: string } | null {
  const lines = block.split('\n').map((line) => line.trim());
  if (lines.length < 2) return null;
  if (!/^\d+$/.test(lines[0])) return null;
  if (!SRT_TIMING_PATTERN.test(lines[1])) {
    return null;
  }
  return {
    sequence: lines[0],
    timing: lines[1],
  };
}


function getTranslatedBody(translatedBlock: string): string {
  const translatedLines = translatedBlock.split('\n');
  const translatedHeader = readHeader(translatedBlock);

  if (translatedHeader) {
    return translatedLines.slice(2).join('\n').trim();
  }

  const firstLine = translatedLines[0]?.trim() ?? '';
  const secondLine = translatedLines[1]?.trim() ?? '';
  if (/^\d+$/.test(firstLine)) {
    return translatedLines.slice(1).join('\n').trim();
  }
  if (SRT_TIMING_PATTERN.test(firstLine)) {
    return translatedLines.slice(1).join('\n').trim();
  }
  if (
    /^\d+$/.test(firstLine) &&
    SRT_TIMING_PATTERN.test(secondLine)
  ) {
    return translatedLines.slice(2).join('\n').trim();
  }

  return translatedBlock.trim();
}

function replaceHeader(
  sourceBlock: string,
  translatedBlock: string,
  index: number,
): string {
  const sourceLines = sourceBlock.split('\n');
  const sourceHeader = readHeader(sourceBlock);

  if (!sourceHeader) {
    throw new TranslationOutputValidationError(
      `원본 ${index + 1}번째 자막 블록 형식이 올바르지 않습니다. 원본="${previewBlock(sourceBlock)}"`,
      'invalid_source_block',
    );
  }

  const translatedBody = getTranslatedBody(translatedBlock);
  if (!translatedBody) {
    throw new TranslationOutputValidationError(
      `AI 번역 결과의 ${index + 1}번째 자막 본문이 비어 있습니다. 원본="${previewBlock(sourceBlock)}" 결과="${previewBlock(translatedBlock)}"`,
      'empty_translated_body',
    );
  }

  return [sourceLines[0].trim(), sourceLines[1].trim(), translatedBody].join('\n');
}

function validateTranslatedSrt(
  sourceContent: string,
  translatedContent: string,
): string {
  const normalized = translatedContent.trim();
  if (!normalized) {
    throw new TranslationOutputValidationError(
      'AI가 빈 번역 결과를 반환했습니다. 다시 시도해주세요.',
      'empty_response',
    );
  }

  const sourceBlocks = parseSrtBlocksByHeader(sourceContent);
  const blankSeparatedBlocks = parseSrtBlocks(normalized);
  const headerSeparatedBlocks = extractSrtBlocksByHeader(normalized);
  const translatedBlocks =
    headerSeparatedBlocks.length === sourceBlocks.length
      ? headerSeparatedBlocks
      : blankSeparatedBlocks;

  if (translatedBlocks.length !== sourceBlocks.length) {
    throw new TranslationOutputValidationError(
      `AI 번역 결과의 자막 블록 수가 원본과 다릅니다. 원본=${sourceBlocks.length}, 결과=${translatedBlocks.length}`,
      'block_count_mismatch',
    );
  }

  return sourceBlocks.map((sourceBlock, index) =>
    replaceHeader(sourceBlock, translatedBlocks[index], index),
  ).join('\n\n');
}

export async function translateSubtitle({
  model,
  movieInfo,
  targetLanguage,
  translationMode,
  translationStyle,
  subtitleContent,
  apiKeys = {},
  chunkPosition,
}: TranslateOptions): Promise<string> {
  const provider = getModelProvider(model);

  function composePrompt(content: string): Promise<string> {
    return composeTranslationPrompt(provider.name, {
      movieInfo,
      targetLanguage,
      translationMode,
      translationStyle,
      subtitleContent: content,
      chunkPosition,
    });
  }

  // Default path: one model call per chunk, then a local reassembly. Cost is
  // capped at a single API call — no validation retries, no per-block splits.
  // On failure it throws so the caller can keep the original (untranslated)
  // chunk and still deliver a complete file.
  async function translateOnce(content: string): Promise<string> {
    const prompt = await composePrompt(content);
    let modelOutput: string;
    try {
      modelOutput = await generateModelText(
        { model, prompt, translationMode },
        apiKeys,
      );
    } catch (error) {
      console.error(`[translation] ${provider.name} call failed`, error);
      throw new Error(toUserMessage(error));
    }

    // The model is sent subtitles without timestamps, so its output has none
    // to give back. Rejoin the translated text with the source timecodes by
    // sequence number — this is what makes line shifting impossible, and it
    // costs no extra API call. Blocks the model merged or skipped keep their
    // original text instead of dragging every later subtitle out of sync.
    const { content: rebuilt, matched, unmatched, total } =
      reassembleTranslatedChunk(content, modelOutput);
    const position = chunkPosition
      ? `${chunkPosition.index}/${chunkPosition.total}`
      : '1/1';

    if (matched === 0 && total > 0) {
      // Nothing lined up — treat it as a failed call so the caller counts it.
      console.error(
        `[translation] chunk ${position}: model output matched none of ${total} blocks`,
      );
      throw new Error(
        '번역 결과를 자막 형식으로 복원하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    }
    if (unmatched > 0) {
      console.warn(
        `[translation] chunk ${position}: ${unmatched}/${total} blocks kept the original text (model output did not line up)`,
      );
    }

    return rebuilt;
  }

  // Strict path (opt-in via TRANSLATION_STRICT_MODE): validate the output,
  // retry with backoff, and re-translate block-by-block on a count mismatch.
  async function translateContentStrict(content: string): Promise<string> {
    const sourceBlocks = parseSrtBlocksByHeader(content);
    const prompt = await composePrompt(content);

    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        const translatedContent = await generateModelText(
          { model, prompt, translationMode },
          apiKeys,
        );
        return validateTranslatedSrt(content, translatedContent);
      } catch (error) {
        lastError = error;
        console.error(
          `[translation] ${provider.name} attempt ${attempt}/${RETRY.MAX_ATTEMPTS} failed`,
          error,
        );

        if (
          error instanceof TranslationOutputValidationError &&
          attempt < RETRY.MAX_ATTEMPTS
        ) {
          const delay = RETRY.BASE_DELAY_MS * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (
          error instanceof TranslationOutputValidationError ||
          isQuotaError(error) ||
          attempt === RETRY.MAX_ATTEMPTS
        ) {
          break;
        }

        const delay = RETRY.BASE_DELAY_MS * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (
      lastError instanceof TranslationOutputValidationError &&
      lastError.code === 'block_count_mismatch' &&
      sourceBlocks.length > 1
    ) {
      const translatedBlocks: string[] = [];
      for (const sourceBlock of sourceBlocks) {
        translatedBlocks.push(await translateContentStrict(sourceBlock));
      }
      return translatedBlocks.join('\n\n');
    }

    throw new Error(toUserMessage(lastError));
  }

  return isStrictModeEnabled()
    ? translateContentStrict(subtitleContent)
    : translateOnce(subtitleContent);
}
