import {
  SUBTITLE_EXTENSIONS,
  type SubtitleExtension,
  type SubtitleFormat,
} from './types';
import { normalizeNewlines } from './timing';

function extensionOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? '';
}

export function isSupportedSubtitleFilename(filename: string): boolean {
  const ext = extensionOf(filename);
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(ext);
}

function formatFromExtension(ext: string): SubtitleFormat | null {
  switch (ext) {
    case 'srt':
      return 'srt';
    case 'vtt':
      return 'vtt';
    case 'smi':
    case 'sami':
      return 'smi';
    case 'ass':
    case 'ssa':
      return 'ass';
    default:
      return null;
  }
}

/** Sniff format from content when the extension is missing or wrong. */
function sniffFormat(content: string): SubtitleFormat | null {
  const head = normalizeNewlines(content).trimStart().slice(0, 4000);
  const upper = head.toUpperCase();

  if (upper.startsWith('WEBVTT')) return 'vtt';
  if (upper.includes('<SAMI') || /<SYNC\b/i.test(head)) return 'smi';
  if (
    /^\[SCRIPT\s+INFO\]/im.test(head) ||
    /^Dialogue:/m.test(head) ||
    /^\[Events\]/im.test(head)
  ) {
    return 'ass';
  }
  // SRT-like: numbered block with comma milliseconds
  if (/\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(head)) {
    return 'srt';
  }
  return null;
}

/**
 * Detect subtitle format from filename extension, falling back to content sniff.
 * Extension wins when it is a known subtitle extension.
 */
export function detectFormat(
  content: string,
  filename: string,
): SubtitleFormat | null {
  const ext = extensionOf(filename);
  const fromExt = formatFromExtension(ext);
  if (fromExt) return fromExt;
  return sniffFormat(content);
}

/** Canonical file extension (no dot) a format is written out as. */
export function formatExtension(format: SubtitleFormat): string {
  return format;
}

/**
 * MIME type for a downloaded subtitle. Only VTT has a registered type that
 * browsers act on; the rest download either way, so they stay plain text.
 */
export function subtitleMime(format: SubtitleFormat): string {
  return format === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8';
}

export function stripSubtitleExtension(filename: string): string {
  return filename.replace(
    new RegExp(`\\.(${SUBTITLE_EXTENSIONS.join('|')})$`, 'i'),
    '',
  );
}

export type { SubtitleExtension };
