import { Router } from 'express';
import { config, env } from '../../config/env';
import { createLocalStorage } from './local';
import { createS3Storage } from './s3';
import type { StorageDriver } from './types';

export { SIGNED_URL_TTL_SECONDS, type StorageDriver } from './types';

export const STORAGE_PUBLIC_PATH = `${config.apiPrefix}/storage`;

function selectDriver(): { driver: StorageDriver; router: Router | null } {
  if (env.STORAGE_DRIVER === 's3') {
    const driver = createS3Storage({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
    return { driver, router: null };
  }
  return createLocalStorage({
    rootDir: env.STORAGE_LOCAL_DIR,
    secret: env.COOKIE_SECRET,
    publicPath: STORAGE_PUBLIC_PATH,
  });
}

const selected = selectDriver();

/** Active object storage (`STORAGE_DRIVER`): Cloudflare R2/S3 in production, local disk in development. */
export const storage: StorageDriver = selected.driver;

/** Upload/download endpoints for the local driver; null when using S3. */
export const localStorageRouter: Router | null = selected.router;
