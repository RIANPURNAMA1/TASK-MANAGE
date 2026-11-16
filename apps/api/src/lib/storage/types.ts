/** Presigned URLs live for 5 minutes (PRD §8). */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

export interface DownloadOptions {
  fileName: string;
  contentType: string;
  inline: boolean;
}

/**
 * Object storage behind presigned URLs: clients upload and download directly with
 * short-lived signed URLs, the bucket/directory itself is never public.
 */
export interface StorageDriver {
  presignUpload(key: string, contentType: string): Promise<string>;
  presignDownload(key: string, opts: DownloadOptions): Promise<string>;
  /** Size in bytes of a stored object, or null if it does not exist. */
  objectSize(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
}

export function contentDisposition({ fileName, inline }: Pick<DownloadOptions, 'fileName' | 'inline'>): string {
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
