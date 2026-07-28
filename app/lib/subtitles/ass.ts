import type { Cue } from './types';
import { normalizeNewlines, parseAssTime } from './timing';

/**
 * Strip ASS/SSA override tags and normalize line breaks in dialogue text.
 * Outside `{}` only `\N`, `\n` and `\h` are special, so nothing else escaped
 * with a backslash is touched — stripping every `\word` run also ate ordinary
 * text like a Windows path.
 */
export function stripAssOverrides(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[nN]/g, '\n')
    .replace(/\\h/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseFormatFields(formatLine: string): string[] {
  const after = formatLine.replace(/^Format:\s*/i, '');
  return after.split(',').map((f) => f.trim().toLowerCase());
}

/**
 * Parse ASS/SSA `[Events]` Dialogue rows into plain cues.
 * Styles, layers, and override tags are discarded.
 */
export function parseAss(content: string): Cue[] {
  const normalized = normalizeNewlines(content);
  if (!normalized.trim()) return [];

  const lines = normalized.split('\n');
  let inEvents = false;
  let fields: string[] | null = null;
  const cues: Cue[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (/^\[/.test(trimmed)) {
      inEvents = /^\[Events\]/i.test(trimmed);
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(trimmed)) {
      fields = parseFormatFields(trimmed);
      continue;
    }

    if (!/^Dialogue:/i.test(trimmed)) continue;

    const payload = trimmed.replace(/^Dialogue:\s*/i, '');
    const parts = splitAssFields(payload, fields?.length ?? 10);
    if (!parts) continue;

    const map = fieldMap(fields, parts);
    const startMs = parseAssTime(map.start ?? '');
    const endMs = parseAssTime(map.end ?? '');
    if (startMs == null || endMs == null) continue;

    const text = stripAssOverrides(map.text ?? '');
    if (!text) continue;

    cues.push({
      index: cues.length + 1,
      startMs,
      endMs,
      text,
    });
  }

  return cues;
}

/**
 * Split a Dialogue payload into N fields. The last field (Text) may contain
 * commas, so only the first N-1 commas are separators.
 */
function splitAssFields(payload: string, fieldCount: number): string[] | null {
  if (fieldCount < 2) return null;
  const parts: string[] = [];
  let rest = payload;
  for (let i = 0; i < fieldCount - 1; i++) {
    const comma = rest.indexOf(',');
    if (comma < 0) return null;
    parts.push(rest.slice(0, comma).trim());
    rest = rest.slice(comma + 1);
  }
  parts.push(rest);
  return parts;
}

function fieldMap(
  fields: string[] | null,
  parts: string[],
): { start?: string; end?: string; text?: string } {
  if (fields && fields.length === parts.length) {
    const out: Record<string, string> = {};
    for (let i = 0; i < fields.length; i++) {
      out[fields[i]] = parts[i];
    }
    return {
      start: out.start,
      end: out.end,
      text: out.text,
    };
  }
  // Default V4+ Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  return {
    start: parts[1],
    end: parts[2],
    text: parts[parts.length - 1],
  };
}
