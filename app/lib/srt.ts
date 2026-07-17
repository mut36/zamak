import { LANG_SUFFIX } from '../config/constants';

export function normalizeSrt(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function parseSrtBlocks(content: string): string[] {
  const normalized = normalizeSrt(content);
  if (!normalized) return [];

  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function chunkSrtBlocks(
  blocks: readonly string[],
  chunkSize: number,
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive integer');
  }

  const chunks: string[] = [];
  for (let index = 0; index < blocks.length; index += chunkSize) {
    chunks.push(blocks.slice(index, index + chunkSize).join('\n\n'));
  }
  return chunks;
}

export function buildOutputFilename(
  originalName: string,
  targetLanguage: string,
): string {
  const suffix =
    LANG_SUFFIX[targetLanguage] ??
    targetLanguage.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 10) ??
    'translated';

  return originalName.replace(/\.srt$/i, `.${suffix || 'translated'}.srt`);
}
