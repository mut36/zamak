import 'server-only';

import { loadAnalysisPrompt } from './loader';
import { renderPromptTemplate } from './renderer';

interface AnalysisPromptContext {
  content: string;
  filenameHint?: string;
}

export async function composeAnalysisPrompt({
  content,
  filenameHint = '',
}: AnalysisPromptContext): Promise<string> {
  const template = await loadAnalysisPrompt();
  const hasSubtitle = Boolean(content.trim());

  return renderPromptTemplate(template, {
    filename: filenameHint,
    subtitleSection: hasSubtitle
      ? `<subtitle_sample>\n${content}\n</subtitle_sample>`
      : '',
  });
}
