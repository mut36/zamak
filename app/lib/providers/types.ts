import type {
  PromptProvider,
  TranslationMode,
} from '../prompts';

export interface ProviderApiKeys {
  /** Per-request Gemini key override; unset means the server key. */
  gemini?: string | null;
}

export interface GenerateTextRequest {
  model: string;
  prompt: string;
  translationMode: TranslationMode;
  apiKey?: string | null;
  /**
   * Fixed instructions sent via the API's system-instruction channel instead
   * of being concatenated into `prompt`. Optional — callers with a single
   * combined string (e.g. analysis) simply omit it.
   */
  systemInstruction?: string;
}

export interface ModelProvider {
  name: PromptProvider;
  isConfigured(apiKey?: string | null): boolean;
  generateText(request: GenerateTextRequest): Promise<string>;
}
