import type { MovieInfo } from './types';
import { loadTranslationRules } from './loader';

function getLanguageConfig(targetLanguage: string) {
  if (targetLanguage === 'ko' || targetLanguage === 'Korean') {
    return {
      language: 'ko' as const,
      translationDirection: '한국어',
    };
  }
  if (targetLanguage === 'en' || targetLanguage === 'English') {
    return {
      language: 'en' as const,
      translationDirection: '영어',
    };
  }
  return {
    language: 'en' as const,
    translationDirection: targetLanguage,
  };
}

function formatMovieInfo(movieInfo: MovieInfo): string {
  const fields = [
    movieInfo.title && `- 제목: ${movieInfo.title}`,
    movieInfo.year && `- 연도: ${movieInfo.year}`,
    movieInfo.genre && `- 장르: ${movieInfo.genre}`,
    movieInfo.country && `- 국가: ${movieInfo.country}`,
    movieInfo.era && `- 시대/배경: ${movieInfo.era}`,
  ].filter(Boolean);

  return fields.length > 0 ? fields.join('\n') : '- 제공되지 않음';
}

export async function buildTranslationVariables(
  movieInfo: MovieInfo,
  targetLanguage: string,
  translationMode: 'chunk',
  chunkPosition?: { index: number; total: number },
): Promise<Record<string, string>> {
  const config = getLanguageConfig(targetLanguage);
  const translationRules = await loadTranslationRules(config.language);

  return {
    translationDirection: config.translationDirection,
    translationMode: '청크',
    chunkContext:
      translationMode === 'chunk' && chunkPosition
        ? `- 현재 위치: 전체 ${chunkPosition.total}개 중 ${chunkPosition.index}번째 청크\n- 다른 청크와 직접 문맥을 공유하지 않으므로 제공된 작품 정보와 인물 관계를 기준으로 말투와 용어를 일관되게 유지해`
        : '',
    movieInfo: formatMovieInfo(movieInfo),
    translationRules,
    examplesSection: '',
    notesSection: movieInfo.notes
      ? `<user_notes>\n${movieInfo.notes}\n</user_notes>`
      : '',
  };
}
