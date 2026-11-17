import type { LlmMessage, LlmProvider, TokenUsage, ToolCall, ToolSpec } from './types';
import { LlmError } from './types';

export type LoopStatus = 'completed' | 'max_steps' | 'budget' | 'cancelled' | 'error';

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface LoopStepEvent {
  kind: 'llm' | 'tool';
  usage?: TokenUsage;
  costUsd?: number;
  toolName?: string;
  input?: unknown;
  output?: string;
  isError?: boolean;
  durationMs: number;
}

export interface RunLoopOptions {
  provider: LlmProvider;
  model: string;
  system: string;
  messages: LlmMessage[];
  tools: ToolSpec[];
  /** Runs one tool. Must not throw for expected failures; return `isError` instead. */
  executeTool: (call: ToolCall) => Promise<ToolResult>;
  costOf: (usage: TokenUsage) => number;
  maxSteps?: number;
  /** Hard ceiling for this run; the loop stops before making a call that would start over it. */
  maxCostUsd?: number;
  maxTokens?: number;
  /** Largest tool output (chars) fed back to the model. */
  maxToolOutputChars?: number;
  signal?: AbortSignal;
  onStep?: (event: LoopStepEvent) => void | Promise<void>;
}

export interface LoopOutcome {
  status: LoopStatus;
  text: string;
  usage: TokenUsage;
  costUsd: number;
  steps: number;
  error?: string;
  messages: LlmMessage[];
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[dipotong ${text.length - max} karakter]`;
}

/**
 * The agent run loop (playbook A3): ask the model, run the tools it requests, feed the results
 * back, repeat until it answers in plain text. Bounded by steps, cost and an abort signal (the
 * kill switch). Persistence and permission checks live in the callbacks, so this stays testable.
 */
export async function runAgentLoop(opts: RunLoopOptions): Promise<LoopOutcome> {
  const { provider, model, system, tools, executeTool, costOf, signal, onStep } = opts;
  const maxSteps = opts.maxSteps ?? 12;
  const maxCostUsd = opts.maxCostUsd ?? 0.5;
  const maxToolOutput = opts.maxToolOutputChars ?? 12_000;
  const messages: LlmMessage[] = [...opts.messages];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let text = '';

  const outcome = (status: LoopStatus, extra: Partial<LoopOutcome> = {}): LoopOutcome => ({
    status,
    text,
    usage,
    costUsd,
    steps: messages.filter((m) => m.role === 'assistant').length,
    messages,
    ...extra,
  });

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return outcome('cancelled');
    if (costUsd >= maxCostUsd) return outcome('budget', { error: 'Batas biaya per run tercapai.' });

    const started = Date.now();
    let response;
    try {
      response = await provider.complete({ model, system, messages, tools, maxTokens: opts.maxTokens ?? 2048, signal });
    } catch (err) {
      if (signal?.aborted) return outcome('cancelled');
      return outcome('error', { error: err instanceof LlmError ? err.message : `Kesalahan tak terduga: ${(err as Error).message}` });
    }

    usage.inputTokens += response.usage.inputTokens;
    usage.outputTokens += response.usage.outputTokens;
    const stepCost = costOf(response.usage);
    costUsd += stepCost;
    await onStep?.({ kind: 'llm', usage: response.usage, costUsd: stepCost, durationMs: Date.now() - started });

    text = response.text;
    if (response.toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: response.text });
      return outcome('completed');
    }

    messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
    for (const call of response.toolCalls) {
      if (signal?.aborted) return outcome('cancelled');
      const toolStarted = Date.now();
      let result: ToolResult;
      try {
        result = await executeTool(call);
      } catch (err) {
        result = { content: `Tool gagal: ${(err as Error).message}`, isError: true };
      }
      const content = clip(result.content, maxToolOutput);
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content, isError: result.isError });
      await onStep?.({ kind: 'tool', toolName: call.name, input: call.input, output: content, isError: result.isError, durationMs: Date.now() - toolStarted });
    }
  }
  return outcome('max_steps', { error: `Run dihentikan setelah ${maxSteps} langkah.` });
}
