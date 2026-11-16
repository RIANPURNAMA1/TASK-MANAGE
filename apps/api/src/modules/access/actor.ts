import type { OrgRole } from '@nexus/shared';

/** The authenticated caller, resolved once per request / socket connection. */
export interface Actor {
  userId: string;
  sessionId: string;
  orgId: string;
  orgRole: OrgRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
      /** Socket.IO id of the caller's tab, to skip echoing real-time events back to it. */
      socketId?: string;
    }
  }
}
