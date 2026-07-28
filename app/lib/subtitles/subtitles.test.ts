import { describe, expect, it } from 'vitest';
import {
  availableFormats,
  BilingualSmiError,
  cuesToSrt,
  decodeSubtitleBytes,
  detectFormat,
  emitInOriginalFormat,
  isSupportedSubtitleFilename,
  parseAss,
  parseSubtitleDocument,
  parseSmi,
  parseVtt,
  RoundTripUnavailableError,
  toCanonicalSrt,
  type SubtitleDoc,
} from './index';
import {
  adjustSubtitleTiming,
  enforceTextRules,
  parseSrtBlocks,
} from '../srt';

describe('detectFormat / filename', () => {
  it('accepts known extensions', () => {
    expect(isSupportedSubtitleFilename('a.srt')).toBe(true);
    expect(isSupportedSubtitleFilename('a.VTT')).toBe(true);
    expect(isSupportedSubtitleFilename('a.smi')).toBe(true);
    expect(isSupportedSubtitleFilename('a.ass')).toBe(true);
    expect(isSupportedSubtitleFilename('a.ssa')).toBe(true);
    expect(isSupportedSubtitleFilename('a.txt')).toBe(false);
  });

  it('prefers extension over sniff', () => {
    expect(detectFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi', 'x.srt')).toBe(
      'srt',
    );
    expect(detectFormat('not really vtt', 'x.vtt')).toBe('vtt');
  });

  it('sniffs when extension is unknown', () => {
    expect(detectFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi', 'x.txt')).toBe(
      'vtt',
    );
    expect(
      detectFormat(
        '[Script Info]\nTitle: t\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi',
        'x.txt',
      ),
    ).toBe('ass');
    expect(
      detectFormat('<SAMI><BODY><SYNC Start=0><P>Hi</BODY></SAMI>', 'x.txt'),
    ).toBe('smi');
  });
});

describe('parseVtt', () => {
  it('parses cues and strips tags', () => {
    const cues = parseVtt(`WEBVTT

NOTE this is ignored

1
00:00:01.000 --> 00:00:03.000
Hello <b>world</b>

00:00:04.500 --> 00:00:05.000
Second`);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      startMs: 1000,
      endMs: 3000,
      text: 'Hello world',
    });
    expect(cues[1].text).toBe('Second');
    expect(cues[1].startMs).toBe(4500);
  });

  it('accepts MM:SS.mmm clocks', () => {
    const cues = parseVtt(`WEBVTT

00:01.000 --> 00:02.500
Short`);
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(2500);
  });
});

describe('parseAss', () => {
  it('extracts Dialogue text and strips overrides', () => {
    const content = `[Script Info]
Title: Test

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\an8}Hello{\\i1} there{\\i0}
Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,skip me
Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,Line\\Ntwo
`;
    const cues = parseAss(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      startMs: 1000,
      endMs: 3500,
      text: 'Hello there',
    });
    expect(cues[1].text).toBe('Line\ntwo');
  });

  it('keeps commas inside Text', () => {
    const content = `[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi, friend, ok
`;
    expect(parseAss(content)[0].text).toBe('Hi, friend, ok');
  });
});

describe('parseSmi', () => {
  it('uses next SYNC as end and skips clear markers', () => {
    const content = `<SAMI>
<BODY>
<SYNC Start=1000><P Class=ENCC>Hello
<SYNC Start=3000><P Class=ENCC>&nbsp;
<SYNC Start=4000><P Class=ENCC>World<br>again
<SYNC Start=6000><P Class=ENCC>&nbsp;
</BODY>
</SAMI>`;
    const cues = parseSmi(content);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      startMs: 1000,
      endMs: 3000,
      text: 'Hello',
    });
    expect(cues[1]).toMatchObject({
      startMs: 4000,
      endMs: 6000,
      text: 'World\nagain',
    });
  });

  it('takes the first language track when multiple P classes exist', () => {
    const content = `<SAMI><BODY>
<SYNC Start=0><P Class=ENCC>Hello<P Class=KRCC>안녕
<SYNC Start=1000><P Class=ENCC>&nbsp;
</BODY></SAMI>`;
    expect(parseSmi(content)[0].text).toBe('Hello');
  });
});

describe('toCanonicalSrt', () => {
  it('passthrough-normalizes SRT', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHi\r\n';
    expect(toCanonicalSrt(srt, 'a.srt')).toBe(
      '1\n00:00:01,000 --> 00:00:02,000\nHi',
    );
  });

  it('converts VTT to SRT', () => {
    const out = toCanonicalSrt(
      `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi`,
      'a.vtt',
    );
    expect(out).toContain('1\n00:00:01,000 --> 00:00:02,000\nHi');
  });

  it('converts ASS to SRT', () => {
    const out = toCanonicalSrt(
      `[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi`,
      'a.ass',
    );
    expect(out).toBe('1\n00:00:01,000 --> 00:00:02,000\nHi');
  });
});

describe('cuesToSrt', () => {
  it('renumbers and drops empty text', () => {
    expect(
      cuesToSrt([
        { index: 9, startMs: 0, endMs: 1000, text: 'A' },
        { index: 10, startMs: 1000, endMs: 2000, text: '  ' },
        { index: 11, startMs: 2000, endMs: 3000, text: 'B' },
      ]),
    ).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB',
    );
  });
});

describe('canonical SRT invariants', () => {
  // A blank line ends a block in SRT, so one inside a cue used to split it
  // into a second block with no number and no timecode — an orphan the model
  // can't be asked for and reassembly can't put an answer back into.
  it('keeps a cue with an interior blank line as one block', () => {
    const ass = toCanonicalSrt(
      `[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,top\\N\\Nbottom
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,second
`,
      'x.ass',
    );
    expect(parseSrtBlocks(ass)).toHaveLength(2);
    expect(ass).toContain('top\nbottom');

    const smi = toCanonicalSrt(
      `<SAMI><BODY>
<SYNC Start=1000><P>top<br><br>bottom
<SYNC Start=3000><P>&nbsp;
</BODY></SAMI>`,
      'x.smi',
    );
    expect(parseSrtBlocks(smi)).toHaveLength(1);
    expect(smi).toContain('top\nbottom');
  });

  it('orders blocks by time even when the source is not ordered', () => {
    const srt = toCanonicalSrt(
      `[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,later
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,earlier
`,
      'x.ass',
    );
    expect(parseSrtBlocks(srt).map((b) => b.split('\n')[2])).toEqual([
      'earlier',
      'later',
    ]);
  });
});

describe('SMI language tracks', () => {
  const bilingual = `<SAMI><BODY>
${Array.from(
  { length: 5 },
  (_, i) =>
    `<SYNC Start=${i * 2000}><P Class=ENCC>Line ${i}<P Class=KRCC>대사 ${i}`,
).join('\n')}
</BODY></SAMI>`;

  it('refuses a file with two substantial tracks', () => {
    expect(() => parseSmi(bilingual)).toThrow(BilingualSmiError);
  });

  // A title card in its own class is not a second language track; refusing
  // those files would be a false alarm.
  it('tolerates a stray class and sticks to the dominant track', () => {
    const content = `<SAMI><BODY>
<SYNC Start=0><P Class=TITLE>제작: 아무개
${Array.from(
  { length: 5 },
  (_, i) => `<SYNC Start=${(i + 1) * 2000}><P Class=KRCC>대사 ${i}`,
).join('\n')}
</BODY></SAMI>`;
    const cues = parseSmi(content);
    expect(cues).toHaveLength(6);
    expect(cues[1].text).toBe('대사 0');
  });
});

describe('stripAssOverrides', () => {
  it('leaves backslashes that are not line breaks alone', () => {
    expect(
      parseAss(`[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,C:\\Users\\alice
`)[0].text,
    ).toBe('C:\\Users\\alice');
  });
});

const SAMPLE_VTT = `WEBVTT - Sample clip
Kind: captions
Language: en

NOTE
This note must survive the round trip.

STYLE
::cue(b) { color: peachpuff; }

intro
00:00:01.000 --> 00:00:03.500 align:middle line:90%
<v Roger>Hello <b>there</b>

2
00:00:04.000 --> 00:00:05.000
Tom &amp; Jerry

00:10.000 --> 00:12.000
Short clock form
`;

/**
 * Splicing every recorded slot with the text already there must reproduce the
 * source exactly. One assertion covers every off-by-one a writer could hit.
 */
function spliceIdentity(doc: SubtitleDoc): string {
  const slots = doc.refs
    .flatMap((ref) => [ref.text, ref.start, ref.end])
    .filter((slot): slot is NonNullable<typeof slot> => slot !== undefined)
    .sort((a, b) => b.start - a.start);
  let out = doc.source;
  for (const slot of slots) {
    out =
      out.slice(0, slot.start) +
      doc.source.slice(slot.start, slot.end) +
      out.slice(slot.end);
  }
  return out;
}

describe('parseSubtitleDocument', () => {
  it('maps every VTT block to a slot and offers a round trip', () => {
    const doc = parseSubtitleDocument(SAMPLE_VTT, 'clip.vtt');
    expect(doc.format).toBe('vtt');
    expect(doc.roundTrip).toBe(true);
    expect(doc.refs).toHaveLength(parseSrtBlocks(doc.srt).length);
    expect(doc.refs.map((r) => r.block)).toEqual([1, 2, 3]);
    expect(availableFormats(doc)).toEqual(['vtt', 'srt']);
  });

  it('records slots that splice back to the identical source', () => {
    const doc = parseSubtitleDocument(SAMPLE_VTT, 'clip.vtt');
    expect(spliceIdentity(doc)).toBe(doc.source);
  });

  it('leaves formats without a writer on the SRT path', () => {
    const doc = parseSubtitleDocument(
      `[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hi
`,
      'x.ass',
    );
    expect(doc.roundTrip).toBe(false);
    expect(availableFormats(doc)).toEqual(['srt']);
    expect(() => emitInOriginalFormat(doc, doc.srt)).toThrow(
      RoundTripUnavailableError,
    );
  });

  it('hands an SRT document straight back', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHi';
    const doc = parseSubtitleDocument(srt, 'x.srt');
    expect(availableFormats(doc)).toEqual(['srt']);
    expect(emitInOriginalFormat(doc, 'translated')).toBe('translated');
  });
});

describe('emitInOriginalFormat (VTT)', () => {
  const doc = parseSubtitleDocument(SAMPLE_VTT, 'clip.vtt');

  /** The pipeline's output shape: same numbering, translated bodies. */
  function translate(bodies: Record<number, string>, timings: Record<number, string> = {}) {
    return parseSrtBlocks(doc.srt)
      .map((block) => {
        const lines = block.split('\n');
        const index = Number(lines[0]);
        return [
          lines[0],
          timings[index] ?? lines[1],
          bodies[index] ?? lines.slice(2).join('\n'),
        ].join('\n');
      })
      .join('\n\n');
  }

  it('replaces only the dialogue, keeping headers, ids and cue settings', () => {
    const out = emitInOriginalFormat(
      doc,
      translate({ 1: '안녕하세요', 2: '톰과 제리', 3: '짧은 형식' }),
    );

    expect(out).toContain('WEBVTT - Sample clip');
    expect(out).toContain('NOTE\nThis note must survive the round trip.');
    expect(out).toContain('STYLE\n::cue(b) { color: peachpuff; }');
    expect(out).toContain('intro\n00:00:01.000 --> 00:00:03.500 align:middle line:90%');
    expect(out).toContain('안녕하세요');
    expect(out).not.toContain('Hello');
    // Untouched timings keep their original spelling, short form included.
    expect(out).toContain('00:10.000 --> 00:12.000');
  });

  it('rewrites a timing only when the pipeline moved it', () => {
    const out = emitInOriginalFormat(
      doc,
      translate({}, { 2: '00:00:04,000 --> 00:00:06,500' }),
    );
    expect(out).toContain('00:00:04.000 --> 00:00:06.500');
    expect(out).toContain('00:00:01.000 --> 00:00:03.500 align:middle line:90%');
  });

  it('escapes text that would otherwise read as markup', () => {
    const out = emitInOriginalFormat(doc, translate({ 1: 'A < B & C' }));
    expect(out).toContain('A &lt; B &amp; C');
  });

  // The hook hands `emitInOriginalFormat` the SRT that has already been
  // through rule enforcement and timing adjustment, so that exact string —
  // renumbered, rewrapped, retimed — is what has to splice cleanly.
  it('accepts the real post-processed pipeline output', () => {
    const translated = translate({
      1: '안녕하세요, 로저입니다',
      2: '톰과 제리',
      3: '이 줄은 화면에 머무는 시간에 비해 글자가 아주 많아서 늘어나야 한다',
    });
    const ruled = enforceTextRules(translated, {
      trailingPunctuation: '.',
    }).content;
    const timed = adjustSubtitleTiming(ruled, {
      cpsTarget: 10,
      cpsHardMax: 12,
      minDurationMs: 800,
      minGapMs: 84,
    });

    const out = emitInOriginalFormat(doc, timed);
    const reparsed = parseVtt(out);

    expect(reparsed).toHaveLength(3);
    expect(out).toContain('align:middle line:90%');
    expect(out).toContain('WEBVTT - Sample clip');
    // The last cue reads too fast, and being last it can only widen backwards.
    // The moved token is rewritten in full VTT spelling while the one that
    // stayed put keeps the source's short `MM:SS.mmm` form.
    expect(reparsed[2].startMs).toBeLessThan(10000);
    expect(out).toMatch(/^00:00:0\d\.\d{3} --> 00:12\.000$/m);
  });

  it('round-trips back into the same cues', () => {
    const translated = translate({ 1: '하나', 2: '둘', 3: '셋' });
    const reparsed = parseVtt(emitInOriginalFormat(doc, translated));
    const original = parseVtt(SAMPLE_VTT);
    expect(reparsed.map((c) => [c.startMs, c.endMs])).toEqual(
      original.map((c) => [c.startMs, c.endMs]),
    );
    expect(reparsed.map((c) => c.text)).toEqual(['하나', '둘', '셋']);
  });
});

describe('decodeSubtitleBytes', () => {
  it('decodes UTF-8', () => {
    const bytes = new TextEncoder().encode('hello 한글');
    expect(decodeSubtitleBytes(bytes, 'a.srt')).toBe('hello 한글');
  });

  it('falls back to euc-kr for .smi when UTF-8 is invalid', () => {
    // "안녕" in EUC-KR / CP949
    const eucKr = Uint8Array.from([0xbe, 0xc8, 0xb3, 0xe7]);
    const decoded = decodeSubtitleBytes(eucKr, 'movie.smi');
    expect(decoded).toBe('안녕');
  });
});
