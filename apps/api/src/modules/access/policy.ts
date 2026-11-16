import type { DivisionRole, OrgRole, ProjectAccess, ProjectRole } from '@nexus/shared';
import { isOrgAdmin } from '@nexus/shared';

/**
 * Pure authorization rules. No I/O here, so every rule is unit-tested exhaustively
 * (PRD §8, NFR-12). The service layer only gathers the facts and calls these.
 */

export interface ProjectFacts {
  orgRole: OrgRole;
  divisionRole: DivisionRole | null;
  projectRole: ProjectRole | null;
  isPrivate: boolean;
  isArchived: boolean;
}

export const NO_ACCESS: ProjectAccess = { canView: false, canEdit: false, canManage: false };

export function projectAccess(f: ProjectFacts): ProjectAccess {
  const manager = isOrgAdmin(f.orgRole) || f.divisionRole === 'LEAD' || f.projectRole === 'ADMIN';
  const member = manager || f.projectRole === 'MEMBER';
  // Public projects are readable by the division (guests never see division-wide content).
  const publicReader =
    !f.isPrivate && f.divisionRole !== null && f.orgRole !== 'GUEST';

  const canView = member || publicReader;
  if (!canView) return NO_ACCESS;

  return {
    canView,
    // Archived projects are read-only until a manager restores them.
    canEdit: member && !f.isArchived,
    canManage: manager,
  };
}

export interface DivisionFacts {
  orgRole: OrgRole;
  divisionRole: DivisionRole | null;
}

export function canViewDivision(f: DivisionFacts): boolean {
  return isOrgAdmin(f.orgRole) || (f.orgRole !== 'GUEST' && f.divisionRole !== null);
}

/** Division Leads manage members and projects of their own division only. */
export function canManageDivision(f: DivisionFacts): boolean {
  return isOrgAdmin(f.orgRole) || f.divisionRole === 'LEAD';
}

/** Leading a division requires at least the Division Lead org role. */
export function canHoldDivisionRole(orgRole: OrgRole, role: DivisionRole): boolean {
  if (orgRole === 'GUEST') return false;
  return role === 'MEMBER' || orgRole !== 'MEMBER';
}

/** Guests may join projects they are invited to, but may never administer them. */
export function canHoldProjectRole(orgRole: OrgRole, role: ProjectRole): boolean {
  return !(orgRole === 'GUEST' && role === 'ADMIN');
}
