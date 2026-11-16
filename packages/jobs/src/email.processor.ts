import { prisma } from '@nexus/db';
import type { EmailJob } from '@nexus/shared';
import { notificationUrl, type JobContext } from './context';
import * as templates from './emails/templates';

/** Delivers one transactional email. Throwing lets the host retry with backoff. */
export async function processEmailJob(ctx: JobContext, job: EmailJob): Promise<void> {
  switch (job.kind) {
    case 'verify-email': {
      const user = await prisma.user.findUnique({ where: { id: job.userId } });
      if (!user) return;
      const email = templates.verifyEmail(user.name, `${ctx.webUrl}/verify-email?token=${job.token}`);
      return ctx.sendMail({ to: user.email, ...email });
    }

    case 'reset-password': {
      const user = await prisma.user.findUnique({ where: { id: job.userId } });
      if (!user || user.deactivatedAt) return;
      const email = templates.resetPassword(user.name, `${ctx.webUrl}/reset-password?token=${job.token}`);
      return ctx.sendMail({ to: user.email, ...email });
    }

    case 'invitation': {
      const invitation = await prisma.invitation.findUnique({
        where: { id: job.invitationId },
        include: { invitedBy: true, organization: true },
      });
      if (!invitation?.email || invitation.revokedAt || invitation.acceptedAt) return;
      const email = templates.invitation(invitation.invitedBy.name, invitation.organization.name, invitation.role, job.link);
      return ctx.sendMail({ to: invitation.email, ...email });
    }

    case 'notification':
      return sendNotificationEmail(ctx, job.notificationId);
  }
}

/** FR-22 "langsung" mode. Re-checks preferences at send time; they may have changed since enqueue. */
async function sendNotificationEmail(ctx: JobContext, notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: true, actor: true, card: { select: { title: true } }, project: { select: { name: true } } },
  });
  if (!n || n.emailedAt || n.readAt || n.user.deactivatedAt || n.user.emailDigest !== 'INSTANT') return;

  const data = n.data as { cardTitle?: string; projectName?: string; excerpt?: string; channelId?: string; channelName?: string; announcementId?: string; announcementTitle?: string; announcementKind?: 'posted' | 'comment'; scopeLabel?: string };
  const email = templates.singleNotification({
    type: n.type,
    actorName: n.actor?.name ?? null,
    cardTitle: n.card?.title ?? data.cardTitle ?? data.channelName ?? data.announcementTitle ?? 'Kartu',
    projectName: n.project?.name ?? data.projectName ?? data.scopeLabel ?? '',
    announcementKind: data.announcementKind,
    excerpt: data.excerpt,
    url: notificationUrl(ctx.webUrl, { projectId: n.projectId, cardId: n.cardId, data }),
  });
  await ctx.sendMail({ to: n.user.email, ...email });
  await prisma.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
}
