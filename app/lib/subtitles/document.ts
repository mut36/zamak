import { parseBlockTiming, parseSrtBlocks, readBlockIndex } from '../srt';
import type { Cue, CueRef, Slot, SubtitleDoc, SubtitleFormat } from './types';
import { detectFormat } from './detect';
import { normalizeNewlines, msToVttTime } from './timing';
import { serializeCues } from './toSrt';
import { parseAss } from './ass';
import { parseSmi } from './smi';
import { escapeVttText, parseVttWithSlots } from './vtt';
import {
  EmptySubtitleError,
  RoundTripUnavailableError,
  UnsupportedSubtitleFormatError,
} from './errors';

/** Where one cue's parts live in the source, before block numbers are known. */
type CueSlots = Pick<CueRef, 'text' | 'start' | 'end'>;

/**
 * How a format writes text and timings back into its own syntax. A format
 * without a writer still translates fine — it just downloads as SRT.
 */
interface FormatWriter {
  /** Plain translated text → the format's payload syntax. */
  text: (body: string) => string;
  /** Milliseconds → the format's timing token. */
  time: (ms: number) => string;
}

const WRITERS: Partial<Record<SubtitleFormat, FormatWriter>> = {
  vtt: {
    text: (body) => escapeVttText(body),
    time: msToVttTime,
  },
};

/**
 * Read a subtitle file into the canonical SRT the pipeline runs on, keeping
 * the original text and a map back into it so the translation can be written
 * out in the format it arrived as.
 *
 * @throws {UnsupportedSubtitleFormatError} unrecognized extension and content.
 * @throws {EmptySubtitleError} parsed, but no cue carried any text.
 * @throws {BilingualSmiError} SAMI file with two or more language tracks.
 */
export function parseSubtitleDocument(
  content: string,
  filename: string,
): SubtitleDoc {
  const format = detectFormat(content, filename);
  if (!format) throw new UnsupportedSubtitleFormatError(filename);

  const source = normalizeNewlines(content);

  // SRT needs no slot bookkeeping: its round-trip output *is* the pipeline's
  // canonical form, so the assembled result can be handed back as-is.
  if (format === 'srt') {
    const srt = source.trim();
    if (!srt) throw new EmptySubtitleError();
    return { format, source, srt, refs: [], roundTrip: true };
  }

  const { cues, slots } = parseCues(format, source);
  const { srt, cueIndexByBlock } = serializeCues(cues);
  if (!srt.trim()) throw new EmptySubtitleError();

  const refs: CueRef[] = [];
  cueIndexByBlock.forEach((cueIndex, blockIndex) => {
    const slot = slots[cueIndex];
    if (!slot) return;
    refs.push({
      block: blockIndex + 1,
      ...slot,
      startMs: cues[cueIndex].startMs,
      endMs: cues[cueIndex].endMs,
    });
  });

  return {
    format,
    source,
    srt,
    refs,
    // Partial coverage would silently drop cues from the rebuilt file, so a
    // round trip is offered only when every block can be written back.
    roundTrip:
      WRITERS[format] !== undefined && refs.length === cueIndexByBlock.length,
  };
}

function parseCues(
  format: Exclude<SubtitleFormat, 'srt'>,
  source: string,
): { cues: Cue[]; slots: (CueSlots | null)[] } {
  if (format === 'vtt') {
    const parsed = parseVttWithSlots(source);
    return {
      cues: parsed.map((p) => p.cue),
      slots: parsed.map((p) => ({ text: p.text, start: p.start, end: p.end })),
    };
  }
  const cues = format === 'ass' ? parseAss(source) : parseSmi(source);
  return { cues, slots: cues.map(() => null) };
}

/** Formats this document can be downloaded as, best first. */
export function availableFormats(doc: SubtitleDoc): SubtitleFormat[] {
  return doc.roundTrip && doc.format !== 'srt' ? [doc.format, 'srt'] : ['srt'];
}

/**
 * Rebuild the original document with the translation spliced in.
 *
 * Nothing is re-serialized: the source is used verbatim as the skeleton and
 * only the recorded text/timing ranges are replaced, so headers, cue settings,
 * styles and every other construct the parsers ignore come through unchanged.
 * A timing is rewritten only when it actually moved, which keeps the original
 * token spelling (`00:01.000` vs `00:00:01.000`) wherever timing adjustment
 * left the cue alone.
 *
 * @throws {RoundTripUnavailableError} when the format has no writer.
 */
export function emitInOriginalFormat(
  doc: SubtitleDoc,
  translatedSrt: string,
): string {
  if (doc.format === 'srt') return translatedSrt;

  const writer = WRITERS[doc.format];
  if (!writer || !doc.roundTrip) {
    throw new RoundTripUnavailableError(doc.format);
  }

  const translated = indexTranslatedBlocks(translatedSrt);
  const edits: { slot: Slot; text: string }[] = [];

  for (const ref of doc.refs) {
    const block = translated.get(ref.block);
    if (!block) continue;

    edits.push({ slot: ref.text, text: writer.text(block.body) });

    if (ref.start && block.startMs !== null && block.startMs !== ref.startMs) {
      edits.push({ slot: ref.start, text: writer.time(block.startMs) });
    }
    if (ref.end && block.endMs !== null && block.endMs !== ref.endMs) {
      edits.push({ slot: ref.end, text: writer.time(block.endMs) });
    }
  }

  return applyEdits(doc.source, edits);
}

interface TranslatedBlock {
  body: string;
  startMs: number | null;
  endMs: number | null;
}

function indexTranslatedBlocks(srt: string): Map<number, TranslatedBlock> {
  const blocks = new Map<number, TranslatedBlock>();
  for (const raw of parseSrtBlocks(srt)) {
    const index = readBlockIndex(raw);
    if (index === null) continue;
    const timing = parseBlockTiming(raw);
    blocks.set(index, {
      body: raw.split('\n').slice(2).join('\n').trim(),
      startMs: timing?.startMs ?? null,
      endMs: timing?.endMs ?? null,
    });
  }
  return blocks;
}

/** Splice back to front so earlier offsets stay valid. */
function applyEdits(source: string, edits: { slot: Slot; text: string }[]): string {
  const ordered = [...edits].sort((a, b) => b.slot.start - a.slot.start);
  let out = source;
  for (const edit of ordered) {
    out = out.slice(0, edit.slot.start) + edit.text + out.slice(edit.slot.end);
  }
  return out;
}
