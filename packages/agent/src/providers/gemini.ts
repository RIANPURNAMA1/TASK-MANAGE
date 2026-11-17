import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ToolCall } from '../types';
import { postJson, type PostJsonOptions } from './http';

type Part = { text: string } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } };
interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

/** Provider-neutral messages → Gemini `contents` (function results are user-turn parts). */
export function toGeminiContents(messages: LlmMessage[]): Content[] {
  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] });
    else if (m.role === 'assistant') {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.input } });
      out.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
    } else {
      const part: Part = { functionResponse: { name: m.name, response: m.isError ? { error: m.content } : { content: m.content } } };
      const prev = out[out.length - 1];
      if (prev?.role === 'user' && prev.parts.every((p) => 'functionResponse' in p)) prev.parts.push(part);
      else out.push({ role: 'user', parts: [part] });
    }
  }
  return out;
}

/** Gemini accepts only an OpenAPI subset: drop keywords it rejects. */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === 'additionalProperties' || key === '$schema' || key === 'default') continue;
      out[key] = geminiSchema(value);
    }
    return out;
  }
  return schema;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export function geminiProvider(apiKey: string, http: Partial<PostJsonOptions> = {}): LlmProvider {
  return {
    name: 'GEMINI',
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const data = await postJson<GeminiResponse>({
        ...http,
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
        headers: { 'x-goog-api-key': apiKey },
        signal: req.signal,
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: toGeminiContents(req.messages),
          generationConfig: { maxOutputTokens: req.maxTokens },
          ...(req.tools.length > 0 && {
            tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.inputSchema) })) }],
          }),
        },
      });
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      // Gemini has no call ids; derive stable ones so results can be matched back.
      const toolCalls: ToolCall[] = parts.flatMap((p, i) =>
        'functionCall' in p ? [{ id: `gemini_${i}_${p.functionCall.name}`, name: p.functionCall.name, input: p.functionCall.args ?? {} }] : [],
      );
      return {
        text: parts.flatMap((p) => ('text' in p ? [p.text] : [])).join('\n').trim(),
        toolCalls,
        usage: { inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0 },
        stopReason: toolCalls.length ? 'tool_use' : candidate?.finishReason === 'MAX_TOKENS' ? 'length' : candidate?.finishReason === 'STOP' ? 'end' : 'other',
      };
    },
  };
}
