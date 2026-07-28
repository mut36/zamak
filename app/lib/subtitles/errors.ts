/**
 * Failures a subtitle file can produce at the upload boundary. They exist as
 * types (rather than message strings) because the upload screen has to map
 * each one to its own Korean copy — see `COPY.upload`.
 */

export class UnsupportedSubtitleFormatError extends Error {
  readonly filename: string;

  constructor(filename: string) {
    super(`Unsupported subtitle format: ${filename}`);
    this.name = 'UnsupportedSubtitleFormatError';
    this.filename = filename;
  }
}

export class EmptySubtitleError extends Error {
  constructor() {
    super('No subtitle cues found');
    this.name = 'EmptySubtitleError';
  }
}

/**
 * A SAMI file carrying two or more substantial language tracks (the usual
 * `KRCC` + `ENCC` pairing). Refused rather than guessed at: picking a track
 * per cue is what produced files with the languages interleaved, and picking
 * one for the whole file needs a UI we haven't built (docs/TODO.md).
 */
export class BilingualSmiError extends Error {
  readonly classes: readonly string[];

  constructor(classes: readonly string[]) {
    super(`SAMI file has multiple language tracks: ${classes.join(', ')}`);
    this.name = 'BilingualSmiError';
    this.classes = classes;
  }
}

/** Thrown when asked to write a format back out that has no writer yet. */
export class RoundTripUnavailableError extends Error {
  readonly format: string;

  constructor(format: string) {
    super(`No round-trip writer for format: ${format}`);
    this.name = 'RoundTripUnavailableError';
    this.format = format;
  }
}
