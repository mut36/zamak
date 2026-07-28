import type { Cue } from './types';
import { normalizeNewlines } from './timing';
import { BilingualSmiError } from './errors';

const SYNC_RE = /<SYNC\b([^>]*)>([\s\S]*?)(?=<SYNC\b|<\/BODY|<\/SAMI|$)/gi;
const START_ATTR_RE = /\bStart\s*=\s*["']?(\d+)/i;
const P_RE = /<P\b([^>]*)>([\s\S]*?)(?=<P\b|<SYNC\b|$)/gi;
const CLASS_ATTR_RE = /\bClass\s*=\s*["']?([^\s"'>]+)/i;

/**
 * A class only counts as a language track if it carries this many cues and
 * this share of them. Bilingual releases split roughly evenly, while the stray
 * `<P Class=SUBTTL>` on a title card does not — the thresholds keep the latter
 * from being mistaken for a second track and getting the file refused.
 */
const MIN_TRACK_PARAGRAPHS = 3;
const MIN_TRACK_SHARE = 0.1;

/** Decode a small set of HTML entities common in SAMI files. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, so that `&amp;lt;` decodes to the literal text `&lt;` rather than
    // being decoded twice into `<`.
    .replace(/&amp;/g, '&');
}

function stripHtml(text: string): string {
  return decodeEntities(
    text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isClearText(text: string): boolean {
  if (!text) return true;
  // After entity decode, nbsp becomes space — treat whitespace-only as clear.
  return text.replace(/\s+/g, '') === '';
}

type Paragraph = {
  /** Lowercased `Class` attribute, or '' when the tag carries none. */
  className: string;
  text: string;
};

type SyncBlock = {
  startMs: number;
  /** Non-empty paragraphs only; a SYNC with none is a clear marker. */
  paragraphs: Paragraph[];
};

function collectSyncs(content: string): SyncBlock[] {
  const syncs: SyncBlock[] = [];
  SYNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SYNC_RE.exec(content)) !== null) {
    const startMatch = m[1].match(START_ATTR_RE);
    if (!startMatch) continue;
    syncs.push({
      startMs: Number(startMatch[1]),
      paragraphs: collectParagraphs(m[2]),
    });
  }
  return syncs;
}

function collectParagraphs(inner: string): Paragraph[] {
  P_RE.lastIndex = 0;
  const paragraphs: Paragraph[] = [];
  let m: RegExpExecArray | null;
  while ((m = P_RE.exec(inner)) !== null) {
    const text = stripHtml(m[2]);
    if (isClearText(text)) continue;
    paragraphs.push({
      className: (m[1].match(CLASS_ATTR_RE)?.[1] ?? '').toLowerCase(),
      text,
    });
  }

  if (paragraphs.length > 0) return paragraphs;

  // No <P> wrappers — treat the whole inner as HTML text.
  const text = stripHtml(inner);
  return isClearText(text) ? [] : [{ className: '', text }];
}

/**
 * Decide which `<P Class=…>` track to read, and refuse the file when there is
 * more than one real answer. Returns the dominant class name.
 */
function resolveTrack(syncs: readonly SyncBlock[]): string {
  const counts = new Map<string, number>();
  let total = 0;
  for (const sync of syncs) {
    for (const paragraph of sync.paragraphs) {
      counts.set(paragraph.className, (counts.get(paragraph.className) ?? 0) + 1);
      total++;
    }
  }
  if (total === 0) return '';

  const substantial = [...counts.entries()].filter(
    ([, count]) =>
      count >= MIN_TRACK_PARAGRAPHS && count / total >= MIN_TRACK_SHARE,
  );
  if (substantial.length > 1) {
    throw new BilingualSmiError(substantial.map(([className]) => className));
  }

  let dominant = '';
  let best = -1;
  for (const [className, count] of counts) {
    if (count > best) {
      dominant = className;
      best = count;
    }
  }
  return dominant;
}

/**
 * Parse SAMI/SMI into plain cues. Empty/`&nbsp;` SYNC markers close the
 * previous cue's end time and do not become cues themselves.
 *
 * @throws {BilingualSmiError} when the file carries two or more language tracks.
 */
export function parseSmi(content: string): Cue[] {
  const normalized = normalizeNewlines(content);
  if (!normalized.trim()) return [];

  const syncs = collectSyncs(normalized);
  if (syncs.length === 0) return [];

  // One track for the whole file. Deciding per SYNC is what used to let a
  // bilingual file come out with its languages interleaved, because the track
  // that happens to be non-empty changes from cue to cue.
  const track = resolveTrack(syncs);

  const cues: Cue[] = [];
  for (let i = 0; i < syncs.length; i++) {
    const sync = syncs[i];
    const text = pickText(sync.paragraphs, track);
    if (!text) continue;

    // End time = next SYNC start, clear markers included.
    let endMs: number | null = null;
    for (let j = i + 1; j < syncs.length; j++) {
      if (syncs[j].startMs > sync.startMs) {
        endMs = syncs[j].startMs;
        break;
      }
    }
    // Fallback when this is the last cue: keep it on screen for 2s.
    if (endMs == null) endMs = sync.startMs + 2000;

    cues.push({
      index: cues.length + 1,
      startMs: sync.startMs,
      endMs,
      text,
    });
  }

  return cues;
}

function pickText(paragraphs: readonly Paragraph[], track: string): string {
  if (paragraphs.length === 0) return '';
  // A lone paragraph is used whatever its class: single-track files are often
  // sloppy about the attribute, and there is no other track to confuse it with.
  if (paragraphs.length === 1) return paragraphs[0].text;
  return (
    paragraphs.find((p) => p.className === track)?.text ?? paragraphs[0].text
  );
}
