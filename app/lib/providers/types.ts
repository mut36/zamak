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

/**
 * What one model call consumed. Every field is a count the provider reported —
 * a missing field means the provider did not say, which is why they are zero
 * rather than optional: a call that reported nothing must not read as a call
 * that cost nothing... except that it is also the only honest default. The
 * `ok` flag on the stored row is what separates the two cases.
 *
 * `thoughts` is billed at the output rate and spent once per request, which is
 * what makes it — not prompt size — the term that decides chunk size
 * (docs/tuning/chunk-size-model.md §5-2-1).
 */
export interface TokenUsage {
  prompt: number;
  cached: number;
  thoughts: number;
  output: number;
}

export interface GenerateTextResult {
  text: string;
  usage: TokenUsage;
  /** The thinking level actually applied, resolved per model. */
  thinkingLevel: string | null;
}

export interface ModelProvider {
  name: PromptProvider;
  isConfigured(apiKey?: string | null): boolean;
  generateText(request: GenerateTextRequest): Promise<GenerateTextResult>;
}
