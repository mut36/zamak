import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PromptProvider } from './types';

const promptCache = new Map<string, Promise<string>>();

function loadPromptFile(relativePath: string): Promise<string> {
  const cached = promptCache.get(relativePath);
  if (cached) return cached;

  const prompt = readFile(
    path.join(process.cwd(), 'prompts', relativePath),
    'utf8',
  ).then((content) => content.trim());

  promptCache.set(relativePath, prompt);
  return prompt;
}

export function loadSystemPromptTemplate(): Promise<string> {
  return loadPromptFile('common/subtitle_translation_system.txt');
}

export function loadTranslationRules(
  language: 'ko' | 'en',
): Promise<string> {
  return loadPromptFile(`common/translation_rules_${language}.txt`);
}

export function loadTranslationPhilosophy(
  style: 'meaning' | 'cinematic',
): Promise<string> {
  return style === 'cinematic'
    ? loadPromptFile('common/cinematic_translation_philosophy_ko.txt')
    : Promise.resolve('');
}

export function loadTranslationExamples(
  language: 'ko',
): Promise<string> {
  return loadPromptFile(`common/translation_examples_${language}.txt`);
}

export function loadAnalysisPrompt(): Promise<string> {
  return loadPromptFile('common/content_analysis.txt');
}

export function loadModelAdapterPrompt(
  provider: PromptProvider,
): Promise<string> {
  return loadPromptFile(`${provider}/adapter.txt`);
}
