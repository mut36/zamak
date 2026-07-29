import type { MovieInfo, TranslationResult } from '../types/translation';
import type { CastSheet } from '../types/glossary';

/** One line of the "이 번역에 실제로 적용된 것" list. `key` selects the copy. */
export interface ReportItem {
  key: 'timecode' | 'context' | 'glossary' | 'relations';
  params?: Record<string, number | string>;
}

/**
 * What we can honestly say about a finished translation.
 *
 * Every item here is backed by a number we actually measured. The prototype
 * also showed a CPS-adjustment count, which we do not track — a report with an
 * invented number in it costs more trust than the extra line buys.
 */
export function buildReport(
  result: TranslationResult,
  ctx: { movieInfo: MovieInfo; castSheet?: CastSheet },
): ReportItem[] {
  const items: ReportItem[] = [
    {
      key: 'timecode',
      params: { lines: result.lineCount, fallback: result.fallbackBlocks ?? 0 },
    },
  ];

  // era/tone are the AI-facing bucket enrich fills. Empty means the lookup
  // found nothing, and claiming we tuned for a period we never learned is a lie.
  const { era, tone } = ctx.movieInfo;
  if (era || tone) {
    items.push({ key: 'context', params: { context: era || tone || '' } });
  }

  const terms = ctx.castSheet?.terms?.length ?? 0;
  if (terms > 0) items.push({ key: 'glossary', params: { terms } });

  const pairs = ctx.castSheet?.relations?.length ?? 0;
  if (pairs > 0) items.push({ key: 'relations', params: { pairs } });

  return items;
}
