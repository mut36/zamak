/** Milliseconds → SRT timing token `HH:MM:SS,mmm`. */
export function msToSrtTime(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const millis = ms % 1000;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

/** Milliseconds → WebVTT timing token `HH:MM:SS.mmm`. */
export function msToVttTime(totalMs: number): string {
  return msToSrtTime(totalMs).replace(',', '.');
}

/**
 * Parse `H:MM:SS.cs` / `HH:MM:SS.cs` (ASS centiseconds) into milliseconds.
 * Also accepts a trailing third digit if present (treat as milliseconds).
 */
export function parseAssTime(token: string): number | null {
  const m = token.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const frac = m[4];
  const fracMs =
    frac.length === 2 ? Number(frac) * 10 : Number(frac.padEnd(3, '0').slice(0, 3));
  if (![hours, minutes, seconds, fracMs].every(Number.isFinite)) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + fracMs;
}

/**
 * Parse a WebVTT / SRT-like clock (`HH:MM:SS.mmm`, `MM:SS.mmm`, comma or dot).
 */
export function parseVttClock(token: string): number | null {
  const m = token
    .trim()
    .match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return null;
  const hours = m[1] != null ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = Number(m[4].padEnd(3, '0').slice(0, 3));
  if (![hours, minutes, seconds, millis].every(Number.isFinite)) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

export function normalizeNewlines(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
