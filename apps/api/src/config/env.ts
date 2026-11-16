import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

/** Empty strings in .env mean "not configured". */
const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const list = z
  .string()
  .default('')
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().default(4000),
    DATABASE_URL: z.string().url(),
    /** Optional. Without Redis the API runs jobs in-process and keeps real-time state in memory (single instance). */
    REDIS_URL: optional,
    WEB_URL: z.string().url(),
    CORS_ORIGINS: list,

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
    MIN_DESKTOP_VERSION: z.string().default('0.0.0'),

    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_REDIRECT_URI: z.string().default(''),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default(path.join(repoRoot, '.data', 'uploads')),
    S3_ENDPOINT: optional,
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().default('Mendunia Workbase <no-reply@nexustask.local>'),
    TZ_DEFAULT: z.string().default('Asia/Jakarta'),
    DAILY_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  })
  .refine(
    (e) => e.STORAGE_DRIVER !== 's3' || (e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY),
    { message: 'STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY' },
  );

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast at boot with a readable message rather than at first use.
  console.error('Invalid environment configuration:', parsed.error.flatten());
  process.exit(1);
}

export const env = parsed.data;

export const config = {
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  redisEnabled: Boolean(env.REDIS_URL),
  googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 30,
  refreshGraceSeconds: 20,
  apiPrefix: '/api/v1',
} as const;

/**
 * Origins the Tauri webview serves the bundled app from (PRD §4): `tauri://localhost` on
 * macOS/Linux, `http(s)://tauri.localhost` on Windows. Always allowed next to CORS_ORIGINS.
 */
export const DESKTOP_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'] as const;
export const allowedOrigins: string[] = [...env.CORS_ORIGINS, ...DESKTOP_ORIGINS];
