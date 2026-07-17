import 'server-only';

import type { NextRequest } from 'next/server';
import {
  getModelProvider,
  isModelProviderConfigured,
  type ProviderApiKeys,
} from '../providers';

export function getProviderApiKeys(request: NextRequest): ProviderApiKeys {
  return {
    openai: request.headers.get('x-openai-key'),
    claude: request.headers.get('x-anthropic-key'),
  };
}

export function assertProviderConfigured(
  model: string,
  apiKeys: ProviderApiKeys,
): void {
  if (isModelProviderConfigured(model, apiKeys)) return;
  const provider = getModelProvider(model);
  throw new Error(`${provider.name} API key not configured`);
}
