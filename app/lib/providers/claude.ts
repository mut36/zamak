import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Experimentation-only provider — NOT wired into `registry.ts`/`ALLOWED_MODELS`.
 * Production translation stays Gemini-only (thinkingConfig, the lean wire
 * format, and chunk sizing were all tuned against Gemini specifically —
 * docs/tuning/). This exists so scripts (scripts/glossary-ab.mts, and future
 * prompt-ab.mts lever-3 work) can run the *same* prompt through Claude for a
 * cost/quality comparison. Configure by dropping ANTHROPIC_API_KEY into
 * .env.local — nothing else to wire.
 */

export interface StructuredJsonRequest {
  model: string;
  system: string;
  user: string;
  /** Plain JSON Schema (not Gemini's Type-enum flavor). */
  jsonSchema: Record<string, unknown>;
  schemaName: string;
}

export interface StructuredJsonResult {
  json: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

/** Model used when CLAUDE_MODEL is unset — matches this session's default tier. */
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Forces structured output via a single required tool call — Claude has no
 * native "response_format: json_schema" like OpenAI, so a tool whose
 * input_schema *is* the desired shape, called with tool_choice forcing it,
 * is the equivalent guarantee to Gemini's responseSchema.
 */
export async function claudeGenerateJson(
  request: StructuredJsonRequest,
): Promise<StructuredJsonResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: request.model,
    max_tokens: 8192,
    system: request.system,
    messages: [{ role: 'user', content: request.user }],
    tools: [
      {
        name: request.schemaName,
        description: `Return the extraction result as ${request.schemaName}.`,
        input_schema: request.jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: request.schemaName },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('Claude did not return a tool_use block');
  }

  return {
    json: toolUse.input,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
