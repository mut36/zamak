import 'server-only';

import {
  ALLOWED_MODELS,
  MODEL_PROVIDERS,
  type AllowedModel,
} from '../../config/constants';
import { claudeProvider } from './claude';
import { geminiProvider } from './gemini';
import { openAIProvider } from './openai';
import type {
  GenerateTextRequest,
  ModelProvider,
  ProviderApiKeys,
} from './types';

const providers = {
  openai: {
    provider: openAIProvider,
    getApiKey: (keys: ProviderApiKeys) => keys.openai,
  },
  claude: {
    provider: claudeProvider,
    getApiKey: (keys: ProviderApiKeys) => keys.claude,
  },
  gemini: {
    provider: geminiProvider,
    getApiKey: () => undefined,
  },
} as const;

function getRegistration(model: string) {
  if (!ALLOWED_MODELS.includes(model as AllowedModel)) {
    throw new Error(`Unsupported model provider: ${model}`);
  }
  return providers[MODEL_PROVIDERS[model as AllowedModel]];
}

export function getModelProvider(model: string): ModelProvider {
  return getRegistration(model).provider;
}

export function isModelProviderConfigured(
  model: string,
  apiKeys: ProviderApiKeys = {},
): boolean {
  const registration = getRegistration(model);
  return registration.provider.isConfigured(registration.getApiKey(apiKeys));
}

export async function generateModelText(
  request: Omit<GenerateTextRequest, 'apiKey'>,
  apiKeys: ProviderApiKeys = {},
): Promise<string> {
  const registration = getRegistration(request.model);
  return registration.provider.generateText({
    ...request,
    apiKey: registration.getApiKey(apiKeys),
  });
}
