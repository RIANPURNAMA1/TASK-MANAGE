import http from 'node:http';
import https from 'node:https';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { assertPublicUrl, guardedLookup, systemResolver, UnsafeUrlError, type Resolver } from './url-guard';

export interface RawResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
}

/** One HTTP GET without following redirects. Injected in tests. */
export type Requester = (url: URL, opts: { timeoutMs: number; maxBytes: number; resolver: Resolver }) => Promise<RawResponse>;

const MAX_TEXT_CHARS = 32_000; // ≈ 8,000 tokens

export const defaultRequester: Requester = (url, { timeoutMs, maxBytes, resolver }) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        // Pinned lookup: the socket connects to an address that was just validated (anti-rebinding).
        lookup: guardedLookup(resolver) as never,
        timeout: timeoutMs,
        headers: { 'user-agent': 'MenduniaWorkbaseAgent/1.0', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'accept-encoding': 'identity' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new Error('Halaman terlalu besar.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
            body: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Waktu habis saat membuka halaman.')));
    req.on('error', reject);
    req.end();
  });

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

export interface FetchPageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxChars?: number;
  resolver?: Resolver;
  requester?: Requester;
}

function extractReadable(html: string, url: string): { title: string; text: string } {
  // jsdom without `runScripts` never executes the page's scripts.
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document.cloneNode(true) as Document).parse();
  const title = (article?.title ?? dom.window.document.title ?? '').trim();
  const text = (article?.textContent ?? dom.window.document.body?.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text };
}

/**
 * Opens a public web page and returns its main readable text (playbook H2). Every hop —
 * including each redirect — is validated, so a public URL cannot bounce the agent to an
 * internal address.
 */
export async function fetchPage(rawUrl: string, options: FetchPageOptions = {}): Promise<FetchedPage> {
  const { timeoutMs = 15_000, maxBytes = 3 * 1024 * 1024, maxRedirects = 5, maxChars = MAX_TEXT_CHARS, resolver = systemResolver, requester = defaultRequester } = options;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current, resolver);
    const res = await requester(url, { timeoutMs, maxBytes, resolver });

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, url).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Error(`Halaman mengembalikan status ${res.status}.`);

    const type = (res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!['text/html', 'text/plain', 'application/xhtml+xml'].includes(type)) throw new Error(`Jenis konten tidak didukung: ${type || 'tidak diketahui'}.`);

    const raw = res.body.toString('utf8');
    const { title, text } = type === 'text/plain' ? { title: '', text: raw.trim() } : extractReadable(raw, url.toString());
    return { url: url.toString(), title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
  }
  throw new UnsafeUrlError(`Terlalu banyak pengalihan (maksimal ${maxRedirects}).`);
}
