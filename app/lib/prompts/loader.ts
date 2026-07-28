import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PromptProvider } from './types';
import type { TargetLangCode } from '../../config/languages';

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

/**
 * Prompt A/B knob: `TRANSLATION_RULES_VARIANT=foo` loads
 * `translation_rules_<lang>_foo.txt` instead of the canonical file, so a rules
 * rewrite can be measured against the live one before replacing it (that is
 * how the current lean rules were adopted — docs/tuning/experiment-log.md,
 * 2026-07-28). Unset in production. Read once at module load, same as
 * THINKING_LEVEL — a variant comparison is one process per variant, not one
 * run with a flag.
 */
const RULES_VARIANT = process.env.TRANSLATION_RULES_VARIANT ?? '';

/**
 * Full translation rules for one target language (format invariants + style).
 * Written in that language. Contains a {{lineMaxChars}} placeholder the
 * caller renders from languages.ts.
 */
export function loadTranslationRules(
  language: TargetLangCode,
): Promise<string> {
  const suffix = RULES_VARIANT ? `_${RULES_VARIANT}` : '';
  return loadPromptFile(`common/translation_rules_${language}${suffix}.txt`);
}

export function loadTranslationPhilosophy(
  style: 'meaning' | 'cinematic',
): Promise<string> {
  return style === 'cinematic'
    ? loadPromptFile('common/cinematic_translation_philosophy_ko.txt')
    : Promise.resolve('');
}

export function loadAnalysisPrompt(): Promise<string> {
  return loadPromptFile('common/content_analysis.txt');
}

export function loadCastSheetExtractionPrompt(): Promise<string> {
  return loadPromptFile('common/cast_sheet_extraction.txt');
}

/**
 * The relations half of the cast sheet, injected only for target languages
 * that actually have a formality axis (TargetLang.formality).
 */
export function loadCastSheetFormalityTask(): Promise<string> {
  return loadPromptFile('common/cast_sheet_formality_task.txt');
}

export function loadModelAdapterPrompt(
  provider: PromptProvider,
): Promise<string> {
  return loadPromptFile(`${provider}/adapter.txt`);
}
