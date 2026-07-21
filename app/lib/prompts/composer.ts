import 'server-only';

import {
  loadModelAdapterPrompt,
  loadSystemPromptTemplate,
  loadTranslationPhilosophy,
} from './loader';
import { renderPromptTemplate } from './renderer';
import { buildTranslationVariables } from './translationContent';
import type {
  ComposedPrompt,
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
): Promise<ComposedPrompt> {
  const [systemTemplate, modelAdapterPrompt, translationPhilosophy] =
    await Promise.all([
    loadSystemPromptTemplate(),
    loadModelAdapterPrompt(provider),
    loadTranslationPhilosophy(context.translationStyle),
  ]);

  const translationVariables = await buildTranslationVariables(
    context.movieInfo,
    context.targetLanguage,
    context.translationMode,
    context.chunkPosition,
  );

  // modelAdapterPrompt is per-provider instructions — empty today (single
  // provider), filtered out so an empty file doesn't leave a blank gap.
  const system = [
    renderPromptTemplate(systemTemplate, {
      ...translationVariables,
      translationPhilosophy,
    }),
    modelAdapterPrompt,
  ]
    .filter(Boolean)
    .join('\n\n');

  const stripped = stripTimestamps(context.subtitleContent);
  const blockCount = stripped.split('\n').filter(line => /^\d+$/.test(line.trim())).length;
  const blockCountInstruction = `이 청크의 자막 블록 수: ${blockCount}개. 출력도 반드시 ${blockCount}개여야 해.`;

  // The three tags system's trust boundary names — content_metadata,
  // user_notes, subtitle_data — are exactly this request's data, so they all
  // live in the user turn. The block-count reminder comes last, after the
  // data it refers to.
  const user = [
    `<content_metadata>\n${translationVariables.movieInfo}\n</content_metadata>`,
    translationVariables.notesSection,
    translationVariables.chunkContext,
    `<subtitle_data>\n${stripped}\n</subtitle_data>`,
    blockCountInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
}
