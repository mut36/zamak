/**
 * Decode subtitle file bytes. UTF-8 first; for `.smi`/`.sami` fall back to
 * EUC-KR / windows-949 — common for Korean SAMI releases.
 */
export function decodeSubtitleBytes(
  bytes: Uint8Array,
  filename: string,
): string {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  const isSmi = ext === 'smi' || ext === 'sami';

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    if (isSmi) {
      for (const label of ['euc-kr', 'windows-949'] as const) {
        try {
          return new TextDecoder(label, { fatal: true }).decode(bytes);
        } catch {
          // try next
        }
      }
      // Last resort: lossy EUC-KR so the user still gets something readable.
      try {
        return new TextDecoder('euc-kr').decode(bytes);
      } catch {
        // fall through
      }
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Read a browser File as decoded subtitle text (handles SMI legacy encodings). */
export async function readSubtitleFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeSubtitleBytes(new Uint8Array(buffer), file.name);
}
