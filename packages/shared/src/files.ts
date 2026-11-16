/** MIME types that can be shown inline in the browser (FR-28). */
export function isPreviewableMime(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf';
}

/** Executable/script types that are refused regardless of extension. */
const BLOCKED_MIME_TYPES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'text/html',
  'image/svg+xml',
]);

export function isAllowedMime(mimeType: string): boolean {
  return /^[\w.+-]+\/[\w.+-]+$/.test(mimeType) && !BLOCKED_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Strips path separators, control characters and leading dots so a user-supplied name
 * is safe to store and to echo back in a Content-Disposition header.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[/\\?%*:|"<>\u0000-\u001F\u007F]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'file';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
