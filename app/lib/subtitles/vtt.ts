import type { Cue, Slot } from './types';
import { normalizeNewlines, parseVttClock } from './timing';

const TIMING_LINE =
  /^((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;

/** Strip WebVTT cue payload tags and embedded timestamps. */
export function stripVttTags(text: string): string {
  return text
    .replace(/<\d{1,2}:\d{2}:\d{2}(?:[,.]\d{1,3})?>/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Last, so `&amp;lt;` decodes to the literal text `&lt;` instead of `<`.
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Escape plain text for a WebVTT cue payload. */
export function escapeVttText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function isSkippableBlock(firstLine: string): boolean {
  const t = firstLine.trim();
  if (!t) return true;
  const upper = t.toUpperCase();
  return (
    upper.startsWith('WEBVTT') ||
    upper.startsWith('NOTE') ||
    upper.startsWith('STYLE') ||
    upper.startsWith('REGION') ||
    upper.startsWith('KIND:') ||
    upper.startsWith('LANGUAGE:')
  );
}

/** Block boundaries (blank-line separated), with surrounding blank space cut. */
function blockRanges(text: string): Slot[] {
  const separator = /\n[ \t]*\n/g;
  const raw: Slot[] = [];
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = separator.exec(text)) !== null) {
    raw.push({ start: pos, end: m.index });
    pos = m.index + m[0].length;
  }
  raw.push({ start: pos, end: text.length });

  const trimmed: Slot[] = [];
  for (const range of raw) {
    let { start } = range;
    let { end } = range;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (start < end) trimmed.push({ start, end });
  }
  return trimmed;
}

function lineRanges(text: string, block: Slot): Slot[] {
  const lines: Slot[] = [];
  let lineStart = block.start;
  for (let i = block.start; i < block.end; i++) {
    if (text[i] === '\n') {
      lines.push({ start: lineStart, end: i });
      lineStart = i + 1;
    }
  }
  lines.push({ start: lineStart, end: block.end });
  return lines;
}

/** A parsed cue plus where its parts live in the source string. */
export interface VttCueSlots {
  cue: Cue;
  text: Slot;
  start: Slot;
  end: Slot;
}

/**
 * Parse a **newline-normalized** WebVTT string, recording the source range of
 * every cue's payload and timing tokens so the file can be written back out
 * with only those ranges replaced. NOTE/STYLE/REGION blocks and cue ids are
 * not parsed — which is exactly why they survive a round trip untouched.
 */
export function parseVttWithSlots(normalized: string): VttCueSlots[] {
  const found: VttCueSlots[] = [];

  for (const block of blockRanges(normalized)) {
    const lines = lineRanges(normalized, block);
    const firstLine = normalized.slice(lines[0].start, lines[0].end);
    if (isSkippableBlock(firstLine)) continue;

    // The timing line is either the first line or the one under a cue id.
    let timingIdx = 0;
    let timingMatch = firstLine.match(TIMING_LINE);
    if (!timingMatch && lines.length > 1) {
      timingIdx = 1;
      timingMatch = normalized
        .slice(lines[1].start, lines[1].end)
        .match(TIMING_LINE);
    }
    if (!timingMatch) continue;

    const startMs = parseVttClock(timingMatch[1]);
    const endMs = parseVttClock(timingMatch[2]);
    if (startMs == null || endMs == null) continue;

    const payload = lines[timingIdx + 1];
    if (!payload) continue;
    const textSlot = { start: payload.start, end: block.end };
    const text = stripVttTags(normalized.slice(textSlot.start, textSlot.end));
    if (!text) continue;

    const timingLine = lines[timingIdx];
    const lineText = normalized.slice(timingLine.start, timingLine.end);
    const arrow = lineText.indexOf('-->');
    const startTokenAt = lineText.indexOf(timingMatch[1]);
    const endTokenAt = lineText.indexOf(timingMatch[2], arrow + 3);

    found.push({
      cue: { index: found.length + 1, startMs, endMs, text },
      text: textSlot,
      start: {
        start: timingLine.start + startTokenAt,
        end: timingLine.start + startTokenAt + timingMatch[1].length,
      },
      end: {
        start: timingLine.start + endTokenAt,
        end: timingLine.start + endTokenAt + timingMatch[2].length,
      },
    });
  }

  return found;
}

/**
 * Parse WebVTT into plain cues. NOTE/STYLE/REGION and cue ids are discarded.
 */
export function parseVtt(content: string): Cue[] {
  return parseVttWithSlots(normalizeNewlines(content)).map((slot) => slot.cue);
}
