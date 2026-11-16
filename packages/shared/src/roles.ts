import type { OrgRole } from './enums';

/** Higher number = more privilege. GUEST is deliberately the lowest. */
const ORG_ROLE_RANK: Record<OrgRole, number> = {
  GUEST: 0,
  MEMBER: 1,
  DIVISION_LEAD: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function orgRoleAtLeast(role: OrgRole, minimum: OrgRole): boolean {
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minimum];
}

/** Owner and Admin can see and manage everything inside the organization. */
export function isOrgAdmin(role: OrgRole): boolean {
  return orgRoleAtLeast(role, 'ADMIN');
}

/**
 * Whether `actor` may assign `target` as someone's org role.
 * Only the Owner can create another Owner/Admin; nobody can outrank themselves.
 */
export function canAssignOrgRole(actor: OrgRole, target: OrgRole): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return !orgRoleAtLeast(target, 'ADMIN');
  return false;
}
