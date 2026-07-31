import 'server-only';

import { GoogleGenAI, FinishReason, ThinkingLevel } from '@google/genai';
import { thinkingLevelForModel } from '../../config/constants';
import { TranslationError } from '../translationErrors';
import type { ModelProvider, TokenUsage } from './types';

const defaultClient = process.env.GOOGLE_GENAI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })
  : null;

export const geminiProvider: ModelProvider = {
  name: 'gemini',

  isConfigured(apiKey) {
    return Boolean(apiKey || process.env.GOOGLE_GENAI_API_KEY);
  },

  async generateText({ model, prompt, apiKey, systemInstruction }) {
    // Routes pass no key today, so this is the server client. The parameter is
    // the seam a future per-account key would use.
    const client = apiKey
      ? new GoogleGenAI({ apiKey })
      : defaultClient;
    if (!client) throw new Error('Google AI API key not configured');
    // thinkingBudget: 0 used to sit here, but this model does not allow
    // disabling thinking — the budget was ignored and we paid for the default
    // level. thinkingLevel is the knob it actually honours. Pro uses
    // PRO_THINKING_LEVEL (default MEDIUM); flash uses THINKING_LEVEL (default LOW).
    const thinking = thinkingLevelForModel(model);
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...(systemInstruction ? { systemInstruction } : {}),
        thinkingConfig: { thinkingLevel: ThinkingLevel[thinking] },
      },
    });

    // thoughts are billed at the output rate and spent once per request, so
    // they drive the per-chunk cost that decides chunk size. Logged here and
    // returned to the caller, which stores it per call — the tuning docs used
    // to be built by reading these lines out of a terminal by hand.
    const raw = response.usageMetadata;
    const usage: TokenUsage = {
      prompt: raw?.promptTokenCount ?? 0,
      cached: raw?.cachedContentTokenCount ?? 0,
      thoughts: raw?.thoughtsTokenCount ?? 0,
      output: raw?.candidatesTokenCount ?? 0,
    };
    console.log(
      `[gemini] model=${model} thinking=${thinking} prompt=${usage.prompt} cached=${usage.cached} thoughts=${usage.thoughts} output=${usage.output}`,
    );

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === FinishReason.SAFETY) {
      throw new TranslationError(
        `Gemini safety filter blocked the response (model=${model}). Try rephrasing the content or switching to the Pro model.`,
        'safety',
      );
    }
    if (finishReason === FinishReason.MAX_TOKENS) {
      throw new TranslationError(
        `Gemini output was truncated: MAX_TOKENS reached (model=${model}). The chunk may be too large.`,
        'oversize',
      );
    }

    return { text: response.text ?? '', usage, thinkingLevel: thinking };
  },
};
