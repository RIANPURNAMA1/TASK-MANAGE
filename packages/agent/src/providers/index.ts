import type { LlmProvider, ProviderName } from '../types';
import { anthropicProvider } from './anthropic';
import { geminiProvider } from './gemini';
import { groqProvider, openaiProvider } from './openai';

export { toAnthropicMessages } from './anthropic';
export { geminiSchema, toGeminiContents } from './gemini';
export { toChatMessages } from './openai';
export { postJson } from './http';

export interface ProviderKeys {
  ANTHROPIC?: string;
  OPENAI?: string;
  GEMINI?: string;
  GROQ?: string;
}

/** Providers whose API key is configured (never exposes the key itself). */
export function availableProviders(keys: ProviderKeys): ProviderName[] {
  return (Object.keys(keys) as ProviderName[]).filter((name) => Boolean(keys[name]));
}

/** Builds the client for a provider; throws a readable error when its key isn't configured. */
export function createProvider(name: ProviderName, keys: ProviderKeys): LlmProvider {
  const key = keys[name];
  if (!key) throw new Error(`Penyedia ${name} belum dikonfigurasi (API key kosong di .env).`);
  switch (name) {
    case 'ANTHROPIC':
      return anthropicProvider(key);
    case 'OPENAI':
      return openaiProvider(key);
    case 'GEMINI':
      return geminiProvider(key);
    case 'GROQ':
      return groqProvider(key);
  }
}

/** Sensible starting models; override per agent. Model ids change often — verify in each provider's docs. */
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  ANTHROPIC: 'claude-sonnet-5-5',
  OPENAI: 'gpt-4o-mini',
  GEMINI: 'gemini-2.0-flash',
  GROQ: 'llama-3.3-70b-versatile',
};
