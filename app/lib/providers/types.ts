import type {
  PromptProvider,
  TranslationMode,
} from '../prompts';

export interface ProviderApiKeys {
  /** User-provided Gemini key (BYOK) for translation calls. */
  gemini?: string | null;
}

export interface GenerateTextRequest {
  model: string;
  prompt: string;
  translationMode: TranslationMode;
  apiKey?: string | null;
}

export interface ModelProvider {
  name: PromptProvider;
  isConfigured(apiKey?: string | null): boolean;
  generateText(request: GenerateTextRequest): Promise<string>;
}
