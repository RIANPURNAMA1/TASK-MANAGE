import { toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import { isPreviewableMime, type AttachmentDTO } from '@nexus/shared';

export const attachmentInclude = {
  uploader: { select: userSummarySelect },
} satisfies Prisma.AttachmentInclude;

export type AttachmentRow = Prisma.AttachmentGetPayload<{ include: typeof attachmentInclude }>;

export function toAttachmentDTO(row: AttachmentRow): AttachmentDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    cardId: row.cardId,
    commentId: row.commentId,
    messageId: row.messageId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploader: toUserSummary(row.uploader),
    createdAt: row.createdAt.toISOString(),
    previewable: isPreviewableMime(row.mimeType),
  };
}
