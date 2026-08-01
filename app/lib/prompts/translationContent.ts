import type { MovieInfo } from './types';
import { loadTranslationRules } from './loader';
import { renderPromptTemplate } from './renderer';
import { getEnabledTargetLang, type TargetLang } from '../../config/languages';

/**
 * Every server path that reaches here has already validated the code
 * (requestValidation.parseTargetLanguage), so an unknown one is a programming
 * error, not user input — throwing beats silently translating into whatever
 * language the fallback happened to pick.
 */
function requireTargetLang(targetLanguage: string): TargetLang {
  const lang = getEnabledTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }
  return lang;
}

/**
 * One self-contained rules file per target language (written in that language).
 * Renders {{lineMaxChars}} from languages.ts. Deliberately not per content
 * profile: the profile decides how long a line stays on screen, not how long
 * the line itself may be (docs/decisions.md §1-19).
 */
async function buildTranslationRules(lang: TargetLang): Promise<string> {
  const template = await loadTranslationRules(lang.code);
  return renderPromptTemplate(template, {
    lineMaxChars: String(lang.lineMaxChars),
  });
}

export function formatMovieInfo(
  movieInfo: Pick<MovieInfo, 'title' | 'year' | 'genre' | 'country' | 'era' | 'tone'>,
): string {
  const fields = [
    movieInfo.title && `- 제목: ${movieInfo.title}`,
    movieInfo.year && `- 연도: ${movieInfo.year}`,
    movieInfo.genre && `- 장르: ${movieInfo.genre}`,
    movieInfo.country && `- 국가: ${movieInfo.country}`,
    movieInfo.era && `- 배경/시대: ${movieInfo.era}`,
    movieInfo.tone && `- 톤앤매너: ${movieInfo.tone}`,
  ].filter(Boolean);

  return fields.length > 0 ? fields.join('\n') : '- 제공되지 않음';
}

export async function buildTranslationVariables(
  movieInfo: MovieInfo,
  targetLanguage: string,
  translationMode: 'chunk',
  chunkPosition?: { index: number; total: number },
): Promise<Record<string, string>> {
  const lang = requireTargetLang(targetLanguage);
  const translationRules = await buildTranslationRules(lang);

  return {
    translationDirection: lang.promptLabel,
    translationMode: '청크',
    chunkContext:
      translationMode === 'chunk' && chunkPosition
        ? `- 현재 위치: 전체 ${chunkPosition.total}개 중 ${chunkPosition.index}번째 청크\n- 다른 청크와 직접 문맥을 공유하지 않으므로 제공된 작품 정보와 인물 관계를 기준으로 말투와 용어를 일관되게 유지해`
        : '',
    movieInfo: formatMovieInfo(movieInfo),
    translationRules,
    notesSection: movieInfo.notes
      ? `<user_notes>\n${movieInfo.notes}\n</user_notes>`
      : '',
  };
}
