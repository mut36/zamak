import 'server-only';

/**
 * Experimentation-only provider — see claude.ts's header for why this isn't
 * wired into registry.ts/ALLOWED_MODELS. Configure by dropping OPENAI_API_KEY
 * into .env.local — nothing else to wire.
 *
 * No hardcoded default model: OpenAI's naming turns over fast enough that a
 * guessed default risks silently pointing at a retired model. Set
 * OPENAI_MODEL explicitly before using this provider.
 */

import type { StructuredJsonRequest, StructuredJsonResult } from './claude';

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function requireOpenAiModel(): string {
  const model = process.env.OPENAI_MODEL;
  if (!model) {
    throw new Error(
      'OPENAI_MODEL not set — pick the exact model to test, e.g. OPENAI_MODEL=gpt-5',
    );
  }
  return model;
}

/**
 * Structured Outputs (response_format: json_schema, strict) is OpenAI's
 * equivalent guarantee to Gemini's responseSchema / Claude's forced tool
 * call: the response is schema-valid JSON, not just JSON-shaped prose.
 */
export async function openaiGenerateJson(
  request: StructuredJsonRequest,
): Promise<StructuredJsonResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: request.model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.schemaName,
        schema: request.jsonSchema,
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');

  return {
    json: JSON.parse(content),
    usage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    },
  };
}
