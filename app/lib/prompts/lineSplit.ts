import { loadLineSplitRules } from './loader';
import { renderPromptTemplate } from './renderer';
import { getEnabledTargetLang } from '../../config/languages';

/**
 * `/api/polish`가 시스템 인스트럭션으로 보내는 문자열.
 *
 * `buildTranslationRules`와 같은 자리에서 `{{lineMaxChars}}`를 렌더한다 —
 * 프롬프트가 19자를 말하고 코드가 다른 수로 판정하면 모델은 영영 못 맞춘다.
 * 상한을 바꾸려면 `languages.ts` 한 곳만 고치면 양쪽이 같이 따라온다.
 */
export async function composeLineSplitPrompt(
  targetLanguage: string,
): Promise<string> {
  const lang = getEnabledTargetLang(targetLanguage);
  if (!lang) {
    throw new Error(`Unsupported target language: ${targetLanguage}`);
  }

  const template = await loadLineSplitRules(lang.code);
  return renderPromptTemplate(template, {
    lineMaxChars: String(lang.lineMaxChars),
  });
}
