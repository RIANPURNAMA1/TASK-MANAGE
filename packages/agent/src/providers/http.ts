import { LlmError } from '../types';

export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first, for 429 / 5xx / network errors. */
  retries?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Trims a provider error body to something short and free of secrets. */
function cleanError(text: string, secrets: string[]): string {
  let out = text.replace(/\s+/g, ' ').slice(0, 300);
  for (const s of secrets) if (s && s.length > 6) out = out.split(s).join('[disembunyikan]');
  return out;
}

/** POST JSON with timeout and bounded retries. Returns the parsed body of a 2xx response. */
export async function postJson<T>(opts: PostJsonOptions): Promise<T> {
  const { url, headers, body, signal, timeoutMs = 90_000, retries = 2, fetchImpl = fetch, sleep = defaultSleep } = opts;
  const secrets = Object.values(headers).filter((v) => v.length > 6);
  let lastError: LlmError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new LlmError('Dibatalkan.');
    const attemptSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: attemptSignal,
      });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      lastError = new LlmError(`Penyedia LLM menolak permintaan (${res.status}): ${cleanError(await res.text(), secrets)}`, res.status, retryable);
      if (!retryable) throw lastError;
    } catch (err) {
      if (err instanceof LlmError && !err.retryable) throw err;
      if (signal?.aborted) throw new LlmError('Dibatalkan.');
      lastError = err instanceof LlmError ? err : new LlmError(`Gagal menghubungi penyedia LLM: ${(err as Error).message}`, undefined, true);
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt);
  }
  throw lastError ?? new LlmError('Gagal menghubungi penyedia LLM.');
}
