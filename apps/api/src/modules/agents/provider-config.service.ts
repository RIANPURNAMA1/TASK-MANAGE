import { createHash } from 'node:crypto';
import { prisma, type AgentProviderConfig } from '@nexus/db';
import { DEFAULT_MODELS, decryptSecret, encryptSecret, parseEncryptionKey } from '@nexus/agent';
import {
  AGENT_PROVIDERS,
  type AgentProviderName,
  type AgentProviderSettingDTO,
  type AgentProviderSource,
  type UpsertAgentProviderInput,
} from '@nexus/shared';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { requireOrgAdmin } from '../access/access.service';
import type { Actor } from '../access/actor';

/** What a provider needs at runtime: the key (never sent to the client) plus the default model. */
export interface ProviderRuntime {
  key?: string;
  model: string;
  source: AgentProviderSource;
}

const ENV_KEYS: Record<AgentProviderName, string | undefined> = {
  ANTHROPIC: env.ANTHROPIC_API_KEY,
  OPENAI: env.OPENAI_API_KEY,
  GEMINI: env.GEMINI_API_KEY,
  GROQ: env.GROQ_API_KEY,
};

/**
 * Keys typed into Settings are AES-256-GCM encrypted. `AGENT_ENCRYPTION_KEY` is preferred; when it
 * is not set we derive a stable key from the server's JWT secret so the feature works out of the box.
 */
function encryptionKey(): Buffer {
  if (env.AGENT_ENCRYPTION_KEY) return parseEncryptionKey(env.AGENT_ENCRYPTION_KEY);
  return createHash('sha256').update(`nexus:agent-provider:${env.JWT_ACCESS_SECRET}`).digest();
}

const CACHE_MS = 5_000;
let cached: { at: number; rows: AgentProviderConfig[] } | null = null;

/** Called after an admin changes a provider so the next request sees it immediately. */
export function invalidateProviderCache(): void {
  cached = null;
}

async function configRows(): Promise<AgentProviderConfig[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
  const rows = await prisma.agentProviderConfig.findMany();
  cached = { at: Date.now(), rows };
  return rows;
}

function decryptKey(row: AgentProviderConfig): string | undefined {
  try {
    return decryptSecret(row.encryptedApiKey, encryptionKey());
  } catch (err) {
    // A key encrypted with a different secret can no longer be used; fall back to `.env`.
    logger.warn({ err, provider: row.provider }, 'provider API key cannot be decrypted');
    return undefined;
  }
}

/** Resolves every provider at once so a status call only reads the table once. */
export async function providerRuntimes(): Promise<Record<AgentProviderName, ProviderRuntime>> {
  const rows = await configRows();
  return Object.fromEntries(
    AGENT_PROVIDERS.map((provider) => {
      const row = rows.find((r) => r.provider === provider);
      const stored = row ? decryptKey(row) : undefined;
      const envKey = ENV_KEYS[provider];
      const key = stored ?? envKey;
      const source: AgentProviderSource = stored ? 'DB' : envKey ? 'ENV' : 'NONE';
      return [provider, { key, model: row?.model ?? DEFAULT_MODELS[provider], source }];
    }),
  ) as Record<AgentProviderName, ProviderRuntime>;
}

export async function providerRuntime(provider: AgentProviderName): Promise<ProviderRuntime> {
  return (await providerRuntimes())[provider];
}

/** `sk-a…f4a2`: enough to recognise a key, not enough to use it. */
function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Admin list for Settings → Asisten AI. Never includes the key itself. */
export async function listProviderSettings(actor: Actor): Promise<AgentProviderSettingDTO[]> {
  requireOrgAdmin(actor);
  const [rows, runtimes] = await Promise.all([configRows(), providerRuntimes()]);
  return AGENT_PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const runtime = runtimes[provider];
    return {
      provider,
      model: runtime.model,
      source: runtime.source,
      configured: Boolean(runtime.key),
      keyHint: runtime.key ? maskKey(runtime.key) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function saveProviderSetting(actor: Actor, provider: AgentProviderName, input: UpsertAgentProviderInput): Promise<AgentProviderSettingDTO> {
  requireOrgAdmin(actor);
  const existing = await prisma.agentProviderConfig.findUnique({ where: { provider } });
  if (!existing && !input.apiKey) throw badRequest('API key wajib diisi untuk penyedia ini.');

  const model = input.model.trim();
  if (existing) {
    await prisma.agentProviderConfig.update({
      where: { provider },
      data: {
        model,
        updatedById: actor.userId,
        ...(input.apiKey ? { encryptedApiKey: encryptSecret(input.apiKey, encryptionKey()) } : {}),
      },
    });
  } else {
    await prisma.agentProviderConfig.create({
      data: { provider, model, encryptedApiKey: encryptSecret(input.apiKey!, encryptionKey()), updatedById: actor.userId },
    });
  }
  invalidateProviderCache();
  return (await listProviderSettings(actor)).find((p) => p.provider === provider)!;
}

/** Removes the key stored in the UI. A key present in `.env` still works afterwards. */
export async function deleteProviderSetting(actor: Actor, provider: AgentProviderName): Promise<void> {
  requireOrgAdmin(actor);
  await prisma.agentProviderConfig.deleteMany({ where: { provider } });
  invalidateProviderCache();
}
