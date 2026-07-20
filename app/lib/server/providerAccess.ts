import 'server-only';

import {
  getModelProvider,
  isModelProviderConfigured,
  type ProviderApiKeys,
} from '../providers';

/**
 * Callers no longer supply keys — every request runs on the server key, which
 * each provider reads from the environment itself. Kept as the one seam a
 * future per-account key would slot into.
 */
export function getProviderApiKeys(): ProviderApiKeys {
  return {};
}

export function assertProviderConfigured(
  model: string,
  apiKeys: ProviderApiKeys,
): void {
  if (isModelProviderConfigured(model, apiKeys)) return;
  const provider = getModelProvider(model);
  throw new Error(`${provider.name} API key not configured`);
}
