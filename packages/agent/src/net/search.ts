export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]>;
}

const MAX_RESULTS = 10;

/** Brave Search API (GET /res/v1/web/search). Verify against Brave's current docs before relying on it. */
export function braveSearch(apiKey: string, fetchImpl: typeof fetch = fetch): SearchProvider {
  return {
    name: 'brave',
    async search(query, limit, signal) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(Math.min(limit, MAX_RESULTS)));
      const res = await fetchImpl(url, { headers: { 'x-subscription-token': apiKey, accept: 'application/json' }, signal: signal ?? AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Pencarian gagal (${res.status}).`);
      const data = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
      return (data.web?.results ?? []).slice(0, limit).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: (r.description ?? '').replace(/<[^>]+>/g, '') }));
    },
  };
}

/** Tavily Search API (POST /search). Verify against Tavily's current docs before relying on it. */
export function tavilySearch(apiKey: string, fetchImpl: typeof fetch = fetch): SearchProvider {
  return {
    name: 'tavily',
    async search(query, limit, signal) {
      const res = await fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: Math.min(limit, MAX_RESULTS) }),
        signal: signal ?? AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Pencarian gagal (${res.status}).`);
      const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (data.results ?? []).slice(0, limit).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: (r.content ?? '').slice(0, 400) }));
    },
  };
}

export function createSearchProvider(config: { provider?: string; braveKey?: string; tavilyKey?: string }): SearchProvider | null {
  if (config.provider === 'tavily' && config.tavilyKey) return tavilySearch(config.tavilyKey);
  if (config.provider === 'brave' && config.braveKey) return braveSearch(config.braveKey);
  return null;
}
