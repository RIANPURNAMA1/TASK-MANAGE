import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { contentDisposition, SIGNED_URL_TTL_SECONDS, type StorageDriver } from './types';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** Cloudflare R2 / AWS S3 / MinIO. File bytes never pass through the API. */
export function createS3Storage(config: S3Config): StorageDriver {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;

  return {
    presignUpload(key, contentType) {
      return getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn: SIGNED_URL_TTL_SECONDS,
      });
    },

    presignDownload(key, opts) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: contentDisposition(opts),
          ResponseContentType: opts.contentType,
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS },
      );
    },

    async objectSize(key) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return head.ContentLength ?? 0;
      } catch (err) {
        if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },

    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}
