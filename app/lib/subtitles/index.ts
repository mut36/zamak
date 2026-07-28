import { parseSubtitleDocument } from './document';
import { decodeSubtitleBytes } from './decode';

/**
 * Convert any supported subtitle file content into a canonical SRT string.
 * Thin wrapper over `parseSubtitleDocument` for callers that only need the
 * text — the document (and with it, format round-tripping) is preferred.
 */
export function toCanonicalSrt(content: string, filename: string): string {
  return parseSubtitleDocument(content, filename).srt;
}

/** Read a browser File and parse it into a subtitle document. */
export async function loadSubtitleFile(file: File) {
  const buffer = await file.arrayBuffer();
  const text = decodeSubtitleBytes(new Uint8Array(buffer), file.name);
  return parseSubtitleDocument(text, file.name);
}

export {
  BilingualSmiError,
  EmptySubtitleError,
  RoundTripUnavailableError,
  UnsupportedSubtitleFormatError,
} from './errors';
export {
  availableFormats,
  emitInOriginalFormat,
  parseSubtitleDocument,
} from './document';
export {
  detectFormat,
  formatExtension,
  isSupportedSubtitleFilename,
  stripSubtitleExtension,
  subtitleMime,
} from './detect';
export { decodeSubtitleBytes, readSubtitleFile } from './decode';
export { escapeVttText, parseVtt, parseVttWithSlots, stripVttTags } from './vtt';
export { parseAss, stripAssOverrides } from './ass';
export { parseSmi } from './smi';
export { cuesToSrt, serializeCues } from './toSrt';
export type { Cue, CueRef, Slot, SubtitleDoc, SubtitleFormat } from './types';
