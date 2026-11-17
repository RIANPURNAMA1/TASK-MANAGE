/** Providers the agent engine can talk to. Mirrors the Prisma `AgentProvider` enum. */
export type ProviderName = 'ANTHROPIC' | 'OPENAI' | 'GEMINI' | 'GROQ';

/** JSON-schema description of a tool, in the provider-neutral shape. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (type: "object"). Keep it simple: Gemini only understands a subset. */
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Conversation in a provider-neutral form; each provider module translates it. */
export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export interface LlmRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
  tools: ToolSpec[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  stopReason: 'end' | 'tool_use' | 'length' | 'other';
}

export interface LlmProvider {
  readonly name: ProviderName;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Provider failure with an HTTP status, safe to show (never contains the API key). */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * How dangerous a tool is (playbook A2/A4):
 *  - `read`: no side effects, runs directly.
 *  - `internal_write`: changes Workbase data; needs the owner's confirmation unless the agent's
 *    autonomy level allows it.
 *  - `external`: leaves the system (email, git push…); ALWAYS needs approval.
 */
export type ToolRisk = 'read' | 'internal_write' | 'external';
