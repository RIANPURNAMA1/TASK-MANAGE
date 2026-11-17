import {
  availableProviders,
  createProvider,
  createSearchProvider,
  DEFAULT_MODELS,
  estimateCostUsd,
  parsePriceOverrides,
  type LlmProvider,
  type ProviderKeys,
  type ProviderName,
  type SearchProvider,
  type TokenUsage,
} from '@nexus/agent';
import { env } from '../../config/env';
import { providerRuntime, providerRuntimes } from './provider-config.service';

const envKeys: ProviderKeys = {
  ANTHROPIC: env.ANTHROPIC_API_KEY,
  OPENAI: env.OPENAI_API_KEY,
  GEMINI: env.GEMINI_API_KEY,
  GROQ: env.GROQ_API_KEY,
};

const prices = parsePriceOverrides(env.AGENT_PRICING_JSON);

/** Tests swap in a scripted provider so runs can be exercised without any API key. */
let providerOverride: ((provider: ProviderName) => LlmProvider) | null = null;
export function overrideProviderForTests(factory: ((provider: ProviderName) => LlmProvider) | null): void {
  providerOverride = factory;
}

/** Keys from Settings override the ones in `.env`; the provider list is their union. */
async function runtimeKeys(): Promise<ProviderKeys> {
  const runtimes = await providerRuntimes();
  return {
    ANTHROPIC: runtimes.ANTHROPIC.key ?? envKeys.ANTHROPIC,
    OPENAI: runtimes.OPENAI.key ?? envKeys.OPENAI,
    GEMINI: runtimes.GEMINI.key ?? envKeys.GEMINI,
    GROQ: runtimes.GROQ.key ?? envKeys.GROQ,
  };
}

export const agentConfig = {
  /** Global kill switch: AGENT_ENABLED=false stops every run and hides the feature. */
  enabled: env.AGENT_ENABLED,
  maxRunCostUsd: env.AGENT_MAX_RUN_COST_USD,
  maxSteps: env.AGENT_MAX_STEPS,
  timezone: env.TZ_DEFAULT,
  providers: async (): Promise<ProviderName[]> => (providerOverride ? ['ANTHROPIC'] : availableProviders(await runtimeKeys())),
  defaultModel: async (provider: ProviderName): Promise<string> => (providerOverride ? DEFAULT_MODELS[provider] : (await providerRuntime(provider)).model),
  isProviderAvailable: async (provider: ProviderName): Promise<boolean> => (providerOverride ? true : Boolean((await providerRuntime(provider)).key)),
  createProvider: async (provider: ProviderName): Promise<LlmProvider> =>
    providerOverride ? providerOverride(provider) : createProvider(provider, await runtimeKeys()),
  search: (): SearchProvider | null =>
    createSearchProvider({ provider: env.AGENT_SEARCH_PROVIDER, braveKey: env.BRAVE_API_KEY, tavilyKey: env.TAVILY_API_KEY }),
  costOf: (provider: ProviderName, model: string, usage: TokenUsage) => estimateCostUsd(provider, model, usage, prices),
};
