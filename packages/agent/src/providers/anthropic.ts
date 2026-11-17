import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ToolCall } from '../types';
import { postJson, type PostJsonOptions } from './http';

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Block[];
}

/** Provider-neutral messages → Anthropic Messages API (tool results are user-turn blocks). */
export function toAnthropicMessages(messages: LlmMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      out.push({ role: 'assistant', content: blocks.length ? blocks : '' });
    } else {
      const block: Block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError && { is_error: true }) };
      const prev = out[out.length - 1];
      // All results of one assistant turn must share a single user message.
      if (prev?.role === 'user' && Array.isArray(prev.content) && prev.content.every((b) => b.type === 'tool_result')) {
        prev.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

interface AnthropicResponse {
  content?: Block[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function anthropicProvider(apiKey: string, http: Partial<PostJsonOptions> = {}): LlmProvider {
  return {
    name: 'ANTHROPIC',
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const data = await postJson<AnthropicResponse>({
        ...http,
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: req.signal,
        body: {
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: toAnthropicMessages(req.messages),
          ...(req.tools.length > 0 && {
            tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
          }),
        },
      });
      const blocks = data.content ?? [];
      const toolCalls: ToolCall[] = blocks.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input ?? {} }] : []));
      return {
        text: blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim(),
        toolCalls,
        usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 },
        stopReason: toolCalls.length ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'length' : data.stop_reason === 'end_turn' ? 'end' : 'other',
      };
    },
  };
}
