import type {
  PromptProvider,
  TranslationMode,
} from '../prompts';

export interface ProviderApiKeys {
  openai?: string | null;
  claude?: string | null;
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
