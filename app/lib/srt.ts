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

const TIMING_LINE = /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;

interface SourceBlock {
  /** Sequence number, or null when the block isn't well-formed SRT. */
  index: number | null;
  sequenceLine: string;
  timingLine: string;
  raw: string;
}

function readSourceBlock(raw: string): SourceBlock {
  const lines = raw.split('\n');
  const sequenceLine = lines[0]?.trim() ?? '';
  const timingLine = lines[1]?.trim() ?? '';
  const wellFormed =
    /^\d+$/.test(sequenceLine) && TIMING_LINE.test(timingLine);

  return {
    index: wellFormed ? Number(sequenceLine) : null,
    sequenceLine,
    timingLine,
    raw,
  };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
}

/**
 * Index the model's output by sequence number.
 *
 * The model is asked for `number\ntranslated text` blocks, but it doesn't
 * always oblige: it may drop the blank lines between blocks, wrap everything
 * in a code fence, emit a preamble, or echo timestamps it was told to omit.
 * So rather than splitting on blank lines, we scan for lines that can only be
 * a sequence number — one we asked for, haven't filled yet, and that moves
 * forward. Dialogue that happens to be bare digits fails at least one of
 * those tests, and a line that looks like an index but fails them is dropped
 * rather than folded into the subtitle text.
 */
function indexTranslatedBodies(
  modelOutput: string,
  expected: ReadonlySet<number>,
): Map<number, string> {
  const bodies = new Map<number, string>();
  let current: number | null = null;
  let buffer: string[] = [];
  let highest = 0;

  const flush = () => {
    if (current === null) return;
    const body = buffer.join('\n').trim();
    if (body) bodies.set(current, body);
    buffer = [];
  };

  for (const line of stripCodeFence(modelOutput).split('\n')) {
    const trimmed = line.trim();

    if (/^\d+$/.test(trimmed)) {
      const candidate = Number(trimmed);
      if (expected.has(candidate)) {
        if (candidate > highest && !bodies.has(candidate)) {
          flush();
          current = candidate;
          highest = candidate;
        }
        // Either way this line is a sequence number, not dialogue — never
        // let it reach the subtitle body.
        continue;
      }
    }

    if (current === null) continue; // preamble before the first block
    if (TIMING_LINE.test(trimmed)) continue; // echoed timestamp
    buffer.push(line);
  }
  flush();

  return bodies;
}

export interface ChunkReassembly {
  /** Full SRT blocks, timecodes restored from the source. */
  content: string;
  /** Blocks that received a translation. */
  matched: number;
  /** Blocks that kept their original text because no translation lined up. */
  unmatched: number;
  total: number;
}

/**
 * Rebuild a translated chunk from the source chunk's timecodes.
 *
 * The model never sees timestamps (we strip them to save tokens), so its
 * output can't carry them and has to be re-joined here. Matching by sequence
 * number rather than by position is what makes line shifting impossible: the
 * timecode always comes from the source block it belongs to. When the model
 * merges two subtitles or skips one, only those blocks miss out — they keep
 * their original text and everything after them stays aligned.
 */
export function reassembleTranslatedChunk(
  sourceChunk: string,
  modelOutput: string,
): ChunkReassembly {
  const sourceBlocks = parseSrtBlocks(sourceChunk).map(readSourceBlock);
  const expected = new Set(
    sourceBlocks
      .map((block) => block.index)
      .filter((index): index is number => index !== null),
  );
  const bodies = indexTranslatedBodies(modelOutput, expected);

  let matched = 0;
  const rebuilt = sourceBlocks.map((block) => {
    if (block.index === null) return block.raw;
    const body = bodies.get(block.index);
    if (!body) return block.raw;
    matched++;
    return `${block.sequenceLine}\n${block.timingLine}\n${body}`;
  });

  return {
    content: rebuilt.join('\n\n'),
    matched,
    unmatched: sourceBlocks.length - matched,
    total: sourceBlocks.length,
  };
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
