import type { ProviderName, TokenUsage } from './types';

/** USD per 1M tokens. */
export interface Price {
  input: number;
  output: number;
}

/**
 * ESTIMATED fallback prices per provider. Real prices differ per model and change over time, so
 * set exact ones with AGENT_PRICING_JSON (e.g. {"claude-sonnet-5-5":{"input":3,"output":15}}).
 * Budgets are only as accurate as these numbers — the dashboard labels cost as "perkiraan".
 */
export const FALLBACK_PRICES: Record<ProviderName, Price> = {
  ANTHROPIC: { input: 5, output: 25 },
  OPENAI: { input: 2.5, output: 10 },
  GEMINI: { input: 1.25, output: 10 },
  GROQ: { input: 0.6, output: 0.8 },
};

export type PriceOverrides = Record<string, Price>;

export function parsePriceOverrides(json: string | undefined): PriceOverrides {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, Partial<Price>>;
    const out: PriceOverrides = {};
    for (const [model, p] of Object.entries(parsed)) {
      if (typeof p?.input === 'number' && typeof p?.output === 'number' && p.input >= 0 && p.output >= 0) out[model] = { input: p.input, output: p.output };
    }
    return out;
  } catch {
    return {};
  }
}

export function estimateCostUsd(provider: ProviderName, model: string, usage: TokenUsage, overrides: PriceOverrides = {}): number {
  const price = overrides[model] ?? FALLBACK_PRICES[provider];
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

/** First day of the current month (UTC) — budgets reset monthly. */
export function startOfBudgetMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
