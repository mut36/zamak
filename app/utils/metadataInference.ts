export interface FilenameMetadata {
  title: string;
  year: string;
  sourceLanguage: string;
  inferredTitle?: string;
  inferredYear?: string;
  inferredGenre?: string;
  inferredCountry?: string;
  inferredEra?: string;
}

const LANGUAGES = [
  'english', 'italian', 'spanish', 'french', 'german',
  'portuguese', 'russian', 'japanese', 'korean', 'chinese',
  'dutch', 'swedish', 'norwegian', 'danish', 'finnish',
  'polish', 'czech', 'turkish', 'arabic', 'hindi',
  'thai', 'vietnamese', 'indonesian', 'greek', 'hebrew',
  'romanian', 'hungarian', 'bulgarian', 'croatian', 'serbian',
  'eng', 'ita', 'spa', 'fra', 'deu', 'por', 'rus', 'jpn', 'kor', 'zho',
];

const QUALITY_TAGS = [
  '720p', '1080p', '2160p', '4k', 'bluray', 'blu-ray', 'bdrip', 'brrip',
  'web-dl', 'webdl', 'webrip', 'web-rip', 'hdtv', 'hdrip', 'dvdrip',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'aac', 'ac3', 'dts',
  'yts', 'yify', 'rarbg', 'proper', 'repack', 'extended', 'unrated',
];

export function parseFilename(filename: string): FilenameMetadata {
  // Remove .srt extension
  let name = filename.replace(/\.srt$/i, '');

  // Replace dots and underscores with spaces (preserve hyphens in words)
  name = name.replace(/[._]/g, ' ');

  // Extract year in parentheses first, e.g. "Il Tuttofare (2018)"
  let year = '';
  const parenYearMatch = name.match(/\((\d{4})\)/);
  if (parenYearMatch) {
    year = parenYearMatch[1];
    name = name.replace(parenYearMatch[0], '').trim();
  }

  // Extract standalone year (1900-2099)
  if (!year) {
    const yearMatch = name.match(/\b((?:19|20)\d{2})\b/);
    if (yearMatch) {
      year = yearMatch[1];
    }
  }

  // Detect source language
  let sourceLanguage = '';
  const nameLower = name.toLowerCase();
  for (const lang of LANGUAGES) {
    const regex = new RegExp(`\\b${lang}\\b`, 'i');
    if (regex.test(nameLower)) {
      sourceLanguage = lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
      break;
    }
  }

  // Build title: take everything before the year (or before language/quality tags)
  const tokens = name.split(/\s+/);
  const titleTokens: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    // Stop at year
    if (token === year) break;
    // Skip quality tags
    if (QUALITY_TAGS.includes(lower)) continue;
    // Skip language names
    if (LANGUAGES.includes(lower)) continue;
    titleTokens.push(token);
  }

  const title = titleTokens.join(' ').replace(/\s*[-–]\s*$/, '').trim();

  return { title, year, sourceLanguage };
}
