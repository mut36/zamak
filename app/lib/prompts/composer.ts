import 'server-only';

import {
  loadCommonPrompt,
  loadModelAdapterPrompt,
  loadTranslationPhilosophy,
} from './loader';
import { renderPromptTemplate } from './renderer';
import { buildTranslationVariables } from './translationContent';
import type {
  PromptProvider,
  TranslationPromptContext,
} from './types';

const TIMESTAMP_LINE = /^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;

function stripTimestamps(content: string): string {
  return content
    .split('\n')
    .filter(line => !TIMESTAMP_LINE.test(line.trim()))
    .join('\n');
}

export async function composeTranslationPrompt(
  provider: PromptProvider,
  context: TranslationPromptContext,
): Promise<string> {
  const [commonTemplate, modelAdapterPrompt, translationPhilosophy] =
    await Promise.all([
    loadCommonPrompt(),
    loadModelAdapterPrompt(provider),
    loadTranslationPhilosophy(context.translationStyle),
  ]);

  const translationVariables = await buildTranslationVariables(
    context.movieInfo,
    context.targetLanguage,
    context.translationMode,
    context.chunkPosition,
  );
  const commonPrompt = renderPromptTemplate(commonTemplate, {
    ...translationVariables,
    translationPhilosophy,
  });
  const stripped = stripTimestamps(context.subtitleContent);
  const blockCount = stripped.split('\n').filter(line => /^\d+$/.test(line.trim())).length;

  const chunkSuffix = translationVariables.chunkContext
    ? `${translationVariables.chunkContext}\n\n`
    : '';
  const blockCountInstruction = `이 청크의 자막 블록 수: ${blockCount}개. 출력도 반드시 ${blockCount}개여야 해.`;
  const subtitleContent = `<subtitle_data>\n${stripped}\n</subtitle_data>`;

  return `${commonPrompt}\n\n${modelAdapterPrompt}\n\n${chunkSuffix}${blockCountInstruction}\n\n${subtitleContent}`;
}
