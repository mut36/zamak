import 'server-only';

import { GoogleGenAI, FinishReason, ThinkingLevel } from '@google/genai';
import { THINKING_LEVEL } from '../../config/constants';
import type { ModelProvider } from './types';

const defaultClient = process.env.GOOGLE_GENAI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })
  : null;

export const geminiProvider: ModelProvider = {
  name: 'gemini',

  isConfigured(apiKey) {
    return Boolean(apiKey || process.env.GOOGLE_GENAI_API_KEY);
  },

  async generateText({ model, prompt, apiKey }) {
    // Routes pass no key today, so this is the server client. The parameter is
    // the seam a future per-account key would use.
    const client = apiKey
      ? new GoogleGenAI({ apiKey })
      : defaultClient;
    if (!client) throw new Error('Google AI API key not configured');
    // thinkingBudget: 0 used to sit here, but this model does not allow
    // disabling thinking — the budget was ignored and we paid for the default
    // level. thinkingLevel is the knob it actually honours.
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel[THINKING_LEVEL] },
      },
    });

    // thoughts are billed at the output rate and spent once per request, so
    // they drive the per-chunk cost that decides chunk size. Log them.
    const usage = response.usageMetadata;
    const cached = usage?.cachedContentTokenCount ?? 0;
    console.log(
      `[gemini] model=${model} thinking=${THINKING_LEVEL} prompt=${usage?.promptTokenCount} cached=${cached} thoughts=${usage?.thoughtsTokenCount ?? 0} output=${usage?.candidatesTokenCount}`,
    );

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === FinishReason.SAFETY) {
      throw new Error(`Gemini safety filter blocked the response (model=${model}). Try rephrasing the content or switching to the Pro model.`);
    }
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new Error(`Gemini output was truncated: MAX_TOKENS reached (model=${model}). The chunk may be too large.`);
    }

    return response.text ?? '';
  },
};
