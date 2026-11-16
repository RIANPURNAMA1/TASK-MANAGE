import { createHash } from 'node:crypto';
import { prisma } from '@nexus/db';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { createSession, type DeviceInfo } from './session.service';

/**
 * Desktop Google SSO (PRD §4): the system browser finishes the Google login, the API
 * hands the app a one-time code through `taskapp://auth/callback`, and the app redeems it
 * together with its PKCE verifier. The code alone is useless to anyone who intercepts the
 * deep link, and the refresh token never travels in a URL.
 */

export const DESKTOP_SCHEME = 'taskapp';
const CODE_TTL_MS = 2 * 60 * 1000;

/** The stored hash binds the code to the app's PKCE challenge. */
const hashOf = (code: string, challenge: string) => sha256(`${code}.${challenge}`);

export async function issueDesktopLoginCode(userId: string, challenge: string): Promise<string> {
  const code = randomToken(32);
  await prisma.userToken.create({
    data: { userId, type: 'DESKTOP_LOGIN', tokenHash: hashOf(code, challenge), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  return code;
}

export async function redeemDesktopLoginCode(code: string, verifier: string, device: DeviceInfo) {
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const invalid = new AppError(400, 'TOKEN_INVALID', 'Kode login tidak valid atau sudah kedaluwarsa. Silakan coba lagi.');

  const record = await prisma.userToken.findUnique({ where: { tokenHash: hashOf(code, challenge) } });
  if (!record || record.type !== 'DESKTOP_LOGIN' || record.usedAt || record.expiresAt < new Date()) throw invalid;
  // Conditional update: a code can be redeemed exactly once, even under concurrency.
  const { count } = await prisma.userToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) throw invalid;

  const user = await prisma.user.findUnique({ where: { id: record.userId }, select: { deactivatedAt: true } });
  if (!user || user.deactivatedAt) throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Akun Anda telah dinonaktifkan');

  const session = await createSession(record.userId, device);
  return { userId: record.userId, ...session };
}

/** Tiny page shown in the system browser that hands control back to the app. */
export function desktopHandoffPage(deepLink: string, ok: boolean): string {
  const safe = deepLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const title = ok ? 'Login berhasil' : 'Login gagal';
  const text = ok ? 'Kembali ke aplikasi Mendunia Workbase untuk melanjutkan.' : 'Kembali ke aplikasi Mendunia Workbase untuk mencoba lagi.';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${safe}"><title>${title} · Mendunia Workbase</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F1F5F9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0F172A">
<main style="max-width:360px;padding:32px;border-radius:16px;background:#fff;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)">
<h1 style="margin:0 0 8px;font-size:20px">${title}</h1><p style="margin:0 0 20px;color:#475569;font-size:14px">${text}</p>
<a href="${safe}" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#2652A0;color:#fff;text-decoration:none;font-weight:600;font-size:14px">Buka Mendunia Workbase</a>
<p style="margin:16px 0 0;color:#64748B;font-size:12px">Tab ini boleh ditutup.</p></main></body></html>`;
}
