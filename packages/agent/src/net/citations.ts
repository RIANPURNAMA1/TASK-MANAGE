/** Normalises a URL so trivial differences (fragment, trailing slash, case of host) don't matter. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return raw;
  }
}

/** URLs cited in free text (punctuation hugging the link is not part of it). */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`)\]}]+/g) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, '')))];
}

/**
 * Every URL the agent cites must have been genuinely opened during the run (playbook H2). Returns
 * the cited URLs that never were — a non-empty result means the report needs human review,
 * because the model may have invented the source.
 */
export function validateCitations(text: string, openedUrls: Iterable<string>): { unverified: string[] } {
  const opened = new Set([...openedUrls].map(normalizeUrl));
  return { unverified: extractUrls(text).filter((u) => !opened.has(normalizeUrl(u))) };
}
