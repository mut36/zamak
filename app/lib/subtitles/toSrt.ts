import type { Cue } from './types';
import { msToSrtTime } from './timing';

export interface SerializedCues {
  srt: string;
  /**
   * `cueIndexByBlock[i]` is the position in the input `cues` array of the cue
   * emitted as block `i + 1`. Blocks are renumbered and reordered here, so this
   * is the only way back to the source cue — and what lets a round-trip writer
   * find the right slot in the original file.
   */
  cueIndexByBlock: number[];
}

/**
 * A blank line ends a block in SRT, so one inside a cue's text would split it
 * into a second, header-less block downstream — an orphan with no number for
 * the model to address or for reassembly to put an answer back into. ASS
 * `\N\N` and SMI `<br><br>` both produce exactly that, so interior blank lines
 * collapse to a single break.
 */
const INTERIOR_BLANK_LINES = /[ \t]*\n(?:[ \t]*\n)+[ \t]*/g;

function normalizeBody(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(INTERIOR_BLANK_LINES, '\n')
    .trim();
}

/**
 * Serialize cues to a canonical SRT string, in time order.
 *
 * Sorting happens here rather than in each parser because no input format
 * guarantees document order matches time order — ASS in particular interleaves
 * signs and dialogue freely — and everything downstream (gap-based chunking,
 * timing adjustment, players) reads an SRT as ascending. Cues that share a
 * start keep their document order.
 */
export function serializeCues(cues: readonly Cue[]): SerializedCues {
  const order = cues
    .map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.startMs - b.cue.startMs || a.index - b.index);

  const blocks: string[] = [];
  const cueIndexByBlock: number[] = [];

  for (const { cue, index } of order) {
    const text = normalizeBody(cue.text);
    if (!text) continue;
    const endMs = Math.max(cue.endMs, cue.startMs + 1);
    cueIndexByBlock.push(index);
    blocks.push(
      `${blocks.length + 1}\n${msToSrtTime(cue.startMs)} --> ${msToSrtTime(endMs)}\n${text}`,
    );
  }

  return { srt: blocks.join('\n\n'), cueIndexByBlock };
}

/** Serialize cues to a canonical SRT string (blank-line-separated blocks). */
export function cuesToSrt(cues: readonly Cue[]): string {
  return serializeCues(cues).srt;
}
