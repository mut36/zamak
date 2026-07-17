import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import type { ModelProvider } from './types';

const defaultClient = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const claudeProvider: ModelProvider = {
  name: 'claude',

  isConfigured(apiKey) {
    return Boolean(apiKey || process.env.ANTHROPIC_API_KEY);
  },

  async generateText({ model, prompt, apiKey }) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API key not configured');

    const client =
      apiKey && apiKey !== process.env.ANTHROPIC_API_KEY
        ? new Anthropic({ apiKey })
        : defaultClient;
    if (!client) throw new Error('Anthropic API key not configured');
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
  },
};
