import 'server-only';

import OpenAI from 'openai';
import type { ModelProvider } from './types';

const defaultClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const openAIProvider: ModelProvider = {
  name: 'openai',

  isConfigured(apiKey) {
    return Boolean(apiKey || process.env.OPENAI_API_KEY);
  },

  async generateText({ model, prompt, apiKey }) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API key not configured');

    const client =
      apiKey && apiKey !== process.env.OPENAI_API_KEY
        ? new OpenAI({ apiKey })
        : defaultClient;
    if (!client) throw new Error('OpenAI API key not configured');
    const response = await client.responses.create({
      model,
      input: prompt,
    });

    return response.output_text;
  },
};
