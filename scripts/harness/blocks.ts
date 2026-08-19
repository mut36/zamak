// Block-level helpers shared by the subtitle harnesses (`polish.mts`,
// `review.mts`). Pure functions over SRT text — no I/O, no model calls, no
// parameters — so both harnesses read the same block the same way and a fix to
// one is a fix to both.
//
// Everything that encodes a harness's *judgement* (what counts as a violation,
// what the score is) stays in that harness. The two disagree on purpose:
// polish treats a reworded block as a prompt violation, review treats it as the
// whole point.

import { parseSrtBlocks } from '../../app/lib/srt';

const MARKUP_TAG = /<[^>]+>/g;

/**
 * The letters, and nothing else. Two bodies with the same signature differ only
 * in whitespace, line breaks and punctuation — i.e. in exactly the ways a
 * format-only pass is allowed to differ. Anything else is the model rewriting.
 */
export function letterSignature(body: string): string {
  return body
    .replace(MARKUP_TAG, '')
    .replace(/[\s.,!?…"'“”‘’·:;\-–—()[\]]/g, '');
}

/** Visible characters on a line — tags do not take up screen width. */
export function visibleLength(line: string): number {
  return line.replace(MARKUP_TAG, '').trim().length;
}

/** Body text of each block, keyed by sequence number. */
export function bodiesByIndex(srt: string): Map<number, string> {
  const bodies = new Map<number, string>();
  for (const block of parseSrtBlocks(srt)) {
    const lines = block.split('\n');
    const seq = Number(lines[0]?.trim());
    if (Number.isInteger(seq)) bodies.set(seq, lines.slice(2).join('\n'));
  }
  return bodies;
}
