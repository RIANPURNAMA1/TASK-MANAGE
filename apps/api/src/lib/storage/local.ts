import { createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { MAX_UPLOAD_BYTES } from '@nexus/shared';
import { Router } from 'express';
import { z } from 'zod';
import { safeEqual } from '../crypto';
import { AppError, notFound } from '../errors';
import { contentDisposition, SIGNED_URL_TTL_SECONDS, type StorageDriver } from './types';

/**
 * Filesystem storage for single-server setups and local development. It keeps the
 * presigned-URL contract of S3: the API issues HMAC-signed, 5-minute tokens and serves
 * the bytes only to holders of a valid token.
 */

const grantSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('put'), key: z.string(), contentType: z.string(), exp: z.number() }),
  z.object({
    op: z.literal('get'),
    key: z.string(),
    contentType: z.string(),
    fileName: z.string(),
    inline: z.boolean(),
    exp: z.number(),
  }),
]);
type Grant = z.infer<typeof grantSchema>;

export interface LocalStorageConfig {
  rootDir: string;
  secret: string;
  /** Public path where `localStorageRouter` is mounted, e.g. `/api/v1/storage`. */
  publicPath: string;
}

export function createLocalStorage(config: LocalStorageConfig): { driver: StorageDriver; router: Router } {
  const root = path.resolve(config.rootDir);

  const sign = (payload: string) => createHmac('sha256', config.secret).update(payload).digest('base64url');

  const issue = (grant: Omit<Grant, 'exp'>): string => {
    const payload = Buffer.from(JSON.stringify({ ...grant, exp: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 })).toString('base64url');
    return `${config.publicPath}/${payload}.${sign(payload)}`;
  };

  const verify = (token: string, op: Grant['op']): Grant => {
    const [payload, signature] = token.split('.');
    const invalid = new AppError(403, 'FORBIDDEN', 'Link file tidak valid atau sudah kedaluwarsa');
    if (!payload || !signature || !safeEqual(signature, sign(payload))) throw invalid;
    const grant = grantSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!grant.success || grant.data.op !== op || grant.data.exp < Date.now()) throw invalid;
    return grant.data;
  };

  /** Keys are server-generated, but still refuse anything resolving outside the root. */
  const fileFor = (key: string): string => {
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw notFound('File');
    return target;
  };

  const driver: StorageDriver = {
    presignUpload: async (key, contentType) => issue({ op: 'put', key, contentType }),
    presignDownload: async (key, opts) => issue({ op: 'get', key, ...opts }),
    async objectSize(key) {
      try {
        return (await stat(fileFor(key))).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(fileFor(key), { force: true });
    },
  };

  const router = Router();

  router.put('/:token', async (req, res) => {
    const grant = verify(String(req.params.token), 'put');
    const target = fileFor(grant.key);
    await mkdir(path.dirname(target), { recursive: true });

    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES) done(new AppError(413, 'VALIDATION_ERROR', 'Ukuran file maksimal 100 MB'));
        else done(null, chunk);
      },
    });
    try {
      await pipeline(req, limit, createWriteStream(target));
    } catch (err) {
      await rm(target, { force: true });
      throw err;
    }
    res.status(200).end();
  });

  router.get('/:token', async (req, res) => {
    const grant = verify(String(req.params.token), 'get');
    if (grant.op !== 'get') throw notFound('File');
    const target = fileFor(grant.key);
    const info = await stat(target).catch(() => null);
    if (!info) throw notFound('File');

    res.setHeader('Content-Type', grant.contentType);
    res.setHeader('Content-Length', info.size);
    res.setHeader('Content-Disposition', contentDisposition(grant));
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Uploaded content must never run script in our origin.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    await pipeline(createReadStream(target), res);
  });

  return { driver, router };
}
