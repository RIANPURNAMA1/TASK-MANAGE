import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, ProviderName, ToolCall } from '../types';
import { postJson, type PostJsonOptions } from './http';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** Provider-neutral messages → OpenAI-style chat messages (also used by Groq). */
export function toChatMessages(system: string, messages: LlmMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        ...(m.toolCalls?.length && {
          tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })),
        }),
      });
    } else out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

/** Models sometimes emit broken JSON arguments; treat that as "no arguments" rather than crash the run. */
function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface ChatResponse {
  choices?: { message?: ChatMessage; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface CompatConfig {
  name: ProviderName;
  baseUrl: string;
  /** OpenAI's newer models reject `max_tokens`; Groq and most compatible servers still use it. */
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
}

function chatCompletionsProvider(config: CompatConfig, apiKey: string, http: Partial<PostJsonOptions>): LlmProvider {
  return {
    name: config.name,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const data = await postJson<ChatResponse>({
        ...http,
        url: `${config.baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${apiKey}` },
        signal: req.signal,
        body: {
          model: req.model,
          [config.maxTokensField]: req.maxTokens,
          messages: toChatMessages(req.system, req.messages),
          ...(req.tools.length > 0 && {
            tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
          }),
        },
      });
      const choice = data.choices?.[0];
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        input: parseArgs(c.function.arguments),
      }));
      return {
        text: (choice?.message?.content ?? '').trim(),
        toolCalls,
        usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        stopReason: toolCalls.length ? 'tool_use' : choice?.finish_reason === 'length' ? 'length' : choice?.finish_reason === 'stop' ? 'end' : 'other',
      };
    },
  };
}

export const openaiProvider = (apiKey: string, http: Partial<PostJsonOptions> = {}) =>
  chatCompletionsProvider({ name: 'OPENAI', baseUrl: 'https://api.openai.com/v1', maxTokensField: 'max_completion_tokens' }, apiKey, http);

export const groqProvider = (apiKey: string, http: Partial<PostJsonOptions> = {}) =>
  chatCompletionsProvider({ name: 'GROQ', baseUrl: 'https://api.groq.com/openai/v1', maxTokensField: 'max_tokens' }, apiKey, http);
