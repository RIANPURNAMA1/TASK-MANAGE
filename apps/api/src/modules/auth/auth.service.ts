import { prisma } from '@nexus/db';
import type { LoginInput, ResetPasswordInput, SetupInput } from '@nexus/shared';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '../../lib/errors';
import { enqueueEmail } from '../../lib/queue';
import { createLimiter, tooManyRequests } from '../../lib/rate-limit';
import { getDummyHash, hashPassword, verifyPassword } from './password';
import { createSession, revokeUserSessions, type DeviceInfo } from './session.service';
import { consumeUserToken, issueUserToken } from './user-token.service';

// PRD §8: 5 failed attempts per 15 minutes, per account and per IP.
const LOGIN_WINDOW_SECONDS = 15 * 60;
const loginByEmail = createLimiter('login:email', 5, LOGIN_WINDOW_SECONDS);
const loginByIp = createLimiter('login:ip', 5, LOGIN_WINDOW_SECONDS);

async function assertLoginAllowed(email: string, ip: string): Promise<void> {
  const [byEmail, byIp] = await Promise.all([loginByEmail.get(email), loginByIp.get(ip)]);
  const blocked = [byEmail, byIp].find((r): r is RateLimiterRes => r !== null && r.remainingPoints <= 0);
  if (blocked) throw tooManyRequests(blocked.msBeforeNext / 1000);
}

async function recordFailedLogin(email: string, ip: string): Promise<void> {
  // consume() rejects once the limit is hit; that is expected and handled on the next attempt.
  await Promise.allSettled([loginByEmail.consume(email), loginByIp.consume(ip)]);
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');

export async function login(input: LoginInput, device: DeviceInfo) {
  const ip = device.ipAddress ?? 'unknown';
  await assertLoginAllowed(input.email, ip);

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);

  if (!user || !user.passwordHash || !passwordOk) {
    await recordFailedLogin(input.email, ip);
    throw invalidCredentials();
  }
  if (user.deactivatedAt) {
    throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'Akun Anda telah dinonaktifkan. Hubungi admin.');
  }
  if (!user.emailVerifiedAt) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Email belum diverifikasi. Cek kotak masuk Anda.');
  }

  await loginByEmail.delete(input.email);
  const session = await createSession(user.id, device);
  return { userId: user.id, ...session };
}

export async function isSetupRequired(): Promise<boolean> {
  return (await prisma.organization.count()) === 0;
}

/** First-run bootstrap: creates the organization and its Owner. Only allowed once. */
export async function setupOrganization(input: SetupInput, device: DeviceInfo) {
  const passwordHash = await hashPassword(input.password);

  const userId = await prisma.$transaction(async (tx) => {
    // A named lock serializes concurrent setup attempts (held by this transaction's connection).
    await tx.$queryRaw`SELECT GET_LOCK('nexustask_setup', 10)`;
    try {
      if ((await tx.organization.count()) > 0) {
        throw new AppError(409, 'SETUP_ALREADY_DONE', 'Organisasi sudah dibuat');
      }
      const org = await tx.organization.create({ data: { name: input.orgName } });
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash, emailVerifiedAt: new Date() },
      });
      await tx.orgMember.create({ data: { orgId: org.id, userId: user.id, role: 'OWNER' } });
      return user.id;
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK('nexustask_setup')`;
    }
  });

  const session = await createSession(userId, device);
  return { userId, ...session };
}

export async function sendVerificationEmail(userId: string): Promise<void> {
  const token = await issueUserToken(userId, 'EMAIL_VERIFICATION');
  await enqueueEmail({ kind: 'verify-email', userId, token });
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeUserToken(token, 'EMAIL_VERIFICATION');
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}

/** Always succeeds from the caller's view so it cannot be used to probe registered emails. */
export async function resendVerification(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt && !user.deactivatedAt) await sendVerificationEmail(user.id);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deactivatedAt) return;
  const token = await issueUserToken(user.id, 'PASSWORD_RESET');
  await enqueueEmail({ kind: 'reset-password', userId: user.id, token });
}

/** Resetting proves email ownership, so it also verifies the email; all sessions are revoked. */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const userId = await consumeUserToken(input.token, 'PASSWORD_RESET');
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: new Date(),
    },
  });
  await revokeUserSessions(userId);
}
