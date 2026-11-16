import { prisma, type UserTokenType } from '@nexus/db';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';

const TTL_MS: Record<UserTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 3600 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
  DESKTOP_LOGIN: 2 * 60 * 1000,
};

/** Issues a single-use token (only its hash is stored) and invalidates older ones of the same type. */
export async function issueUserToken(userId: string, type: UserTokenType): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    prisma.userToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.userToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS[type]) },
    }),
  ]);
  return token;
}

/** Marks the token used and returns its user id; throws for unknown, used or expired tokens. */
export async function consumeUserToken(token: string, type: UserTokenType): Promise<string> {
  const record = await prisma.userToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, 'TOKEN_INVALID', 'Link tidak valid atau sudah kedaluwarsa');
  }
  // Conditional update guards against two concurrent uses of the same token.
  const { count } = await prisma.userToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) throw new AppError(400, 'TOKEN_INVALID', 'Link sudah digunakan');
  return record.userId;
}
