import 'server-only';

import {
  loadGlossaryDirective,
  loadModelAdapterPrompt,
  loadSystemPromptTemplate,
  loadTranslationPhilosophy,
} from './loader';
import { renderPromptTemplate } from './renderer';
import { buildTranslationVariables } from './translationContent';
import { renderGlossaryTags } from './glossaryContent';
import { formatBlocksForModel, getBlockIndexRange, parseSrtBlocks } from '../srt';
import { getTargetLang } from '../../config/languages';
import type {
  ComposedPrompt,
  PromptProvider,
  TranslationPromptContext,
} from './types';

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

  // [N]-bracketed markers, not bare numbers — see formatBlocksForModel's doc
  // for why the bracket matters (dialogue that is itself a number is
  // otherwise indistinguishable from a sequence marker once timestamps are
  // gone). Block count comes from the real parsed block structure, not from
  // counting bare-digit lines in the formatted text — a source block whose
  // body is purely numeric would otherwise inflate the count.
  const formatted = formatBlocksForModel(context.subtitleContent);
  const blockCount = parseSrtBlocks(context.subtitleContent).length;
  const blockCountInstruction = `이 청크의 자막 블록 수: ${blockCount}개. 출력도 반드시 ${blockCount}개여야 해.`;

  // Only relations whose block range overlaps this chunk apply here — a
  // relation tagged for blocks 1-412 is irrelevant (and would be misleading)
  // in a chunk covering blocks 900-1000. Terms (spelling) are not filtered —
  // consistent spelling matters file-wide regardless of chunk.
  const chunkRange = getBlockIndexRange(context.subtitleContent);
  const { glossary, speechRelations, narration } = renderGlossaryTags(
    context.castSheet,
    chunkRange,
    getTargetLang(context.targetLanguage)?.formality ?? null,
  );

  // 판정 기준은 context.castSheet의 유무가 아니라 *렌더된 태그*다. 시트가 있어도
  // 말투 축 없는 도착어이거나 terms가 비면 태그가 하나도 안 붙는데, 그때 지시문만
  // 남으면 없는 표를 가리키는 문장이 된다.
  const glossaryDirective =
    glossary || speechRelations ? await loadGlossaryDirective() : '';

  // modelAdapterPrompt is per-provider instructions — empty today (single
  // provider), filtered out so an empty file doesn't leave a blank gap.
  const system = [
    renderPromptTemplate(systemTemplate, {
      ...translationVariables,
      translationPhilosophy,
      glossaryDirective,
    }),
    modelAdapterPrompt,
  ]
    .filter(Boolean)
    .join('\n\n');

  // The tags system's trust boundary names — content_metadata, user_notes,
  // glossary, speech_relations, subtitle_data — are exactly this request's
  // data, so they all live in the user turn. The block-count reminder comes
  // last, after the data it refers to.
  const user = [
    `<content_metadata>\n${translationVariables.movieInfo}\n</content_metadata>`,
    translationVariables.notesSection,
    translationVariables.chunkContext,
    glossary,
    speechRelations,
    narration,
    `<subtitle_data>\n${formatted}\n</subtitle_data>`,
    blockCountInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
}
