import type { MovieInfo } from './types';
import { loadTranslationFormatRules, loadTranslationRules } from './loader';
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
 * Shared format invariants first, then the target language's style delta
 * under its own heading — see prompts/common/translation_rules_format.txt.
 */
async function buildTranslationRules(lang: TargetLang): Promise<string> {
  const [formatTemplate, languageRules] = await Promise.all([
    loadTranslationFormatRules(),
    loadTranslationRules(lang.code),
  ]);

  const formatRules = renderPromptTemplate(formatTemplate, {
    lineMaxChars: String(lang.lineMaxChars),
  });

  return `${formatRules}\n\n[도착어(${lang.promptLabel}) 지침]\n${languageRules}`;
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
