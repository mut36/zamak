import 'server-only';

import { ALLOWED_MODELS, type AllowedModel } from '../../config/constants';
import { geminiProvider } from './gemini';
import type {
  GenerateTextRequest,
  ModelProvider,
  ProviderApiKeys,
} from './types';

// Single provider (Gemini). The registry indirection is kept minimal so a
// second provider could be reintroduced without touching call sites.
function assertAllowed(model: string): void {
  if (!ALLOWED_MODELS.includes(model as AllowedModel)) {
    throw new Error(`Unsupported model: ${model}`);
  }
}

export function getModelProvider(model: string): ModelProvider {
  assertAllowed(model);
  return geminiProvider;
}

export function isModelProviderConfigured(
  model: string,
  apiKeys: ProviderApiKeys = {},
): boolean {
  assertAllowed(model);
  return geminiProvider.isConfigured(apiKeys.gemini);
}

export async function generateModelText(
  request: Omit<GenerateTextRequest, 'apiKey'>,
  apiKeys: ProviderApiKeys = {},
): Promise<string> {
  assertAllowed(request.model);
  return geminiProvider.generateText({ ...request, apiKey: apiKeys.gemini });
}
