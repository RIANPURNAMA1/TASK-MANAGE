import { describe, expect, it } from 'vitest';
import type { DivisionRole, OrgRole, ProjectRole } from '@nexus/shared';
import {
  canHoldDivisionRole,
  canHoldProjectRole,
  canManageDivision,
  canViewDivision,
  projectAccess,
  type ProjectFacts,
} from './policy';

const base: ProjectFacts = {
  orgRole: 'MEMBER',
  divisionRole: null,
  projectRole: null,
  isPrivate: true,
  isArchived: false,
};

const access = (overrides: Partial<ProjectFacts>) => projectAccess({ ...base, ...overrides });

describe('projectAccess', () => {
  it('denies outsiders of a private project', () => {
    expect(access({})).toEqual({ canView: false, canEdit: false, canManage: false });
    expect(access({ divisionRole: 'MEMBER' })).toEqual({ canView: false, canEdit: false, canManage: false });
  });

  it('lets division members read but not edit public projects', () => {
    expect(access({ isPrivate: false, divisionRole: 'MEMBER' })).toEqual({
      canView: true,
      canEdit: false,
      canManage: false,
    });
  });

  it('hides public projects from members of other divisions', () => {
    expect(access({ isPrivate: false }).canView).toBe(false);
  });

  it('never exposes division-wide projects to guests', () => {
    expect(access({ orgRole: 'GUEST', isPrivate: false, divisionRole: 'MEMBER' }).canView).toBe(false);
    expect(access({ orgRole: 'GUEST', projectRole: 'MEMBER' })).toEqual({
      canView: true,
      canEdit: true,
      canManage: false,
    });
  });

  it('gives project members edit and project admins manage rights', () => {
    expect(access({ projectRole: 'MEMBER' })).toEqual({ canView: true, canEdit: true, canManage: false });
    expect(access({ projectRole: 'ADMIN' })).toEqual({ canView: true, canEdit: true, canManage: true });
  });

  it('gives division leads and org admins full control', () => {
    expect(access({ divisionRole: 'LEAD', orgRole: 'DIVISION_LEAD' }).canManage).toBe(true);
    for (const orgRole of ['OWNER', 'ADMIN'] as OrgRole[]) {
      expect(access({ orgRole })).toEqual({ canView: true, canEdit: true, canManage: true });
    }
  });

  it('makes archived projects read-only but still manageable', () => {
    expect(access({ projectRole: 'MEMBER', isArchived: true })).toEqual({
      canView: true,
      canEdit: false,
      canManage: false,
    });
    expect(access({ projectRole: 'ADMIN', isArchived: true })).toEqual({
      canView: true,
      canEdit: false,
      canManage: true,
    });
  });

  it('is monotonic: manage ⇒ view, edit ⇒ view', () => {
    const orgRoles: OrgRole[] = ['OWNER', 'ADMIN', 'DIVISION_LEAD', 'MEMBER', 'GUEST'];
    const divisionRoles: (DivisionRole | null)[] = ['LEAD', 'MEMBER', null];
    const projectRoles: (ProjectRole | null)[] = ['ADMIN', 'MEMBER', null];
    for (const orgRole of orgRoles)
      for (const divisionRole of divisionRoles)
        for (const projectRole of projectRoles)
          for (const isPrivate of [true, false])
            for (const isArchived of [true, false]) {
              const a = projectAccess({ orgRole, divisionRole, projectRole, isPrivate, isArchived });
              if (a.canManage || a.canEdit) expect(a.canView).toBe(true);
            }
  });
});

describe('division rules', () => {
  it('limits division visibility to members and admins', () => {
    expect(canViewDivision({ orgRole: 'MEMBER', divisionRole: null })).toBe(false);
    expect(canViewDivision({ orgRole: 'MEMBER', divisionRole: 'MEMBER' })).toBe(true);
    expect(canViewDivision({ orgRole: 'GUEST', divisionRole: 'MEMBER' })).toBe(false);
    expect(canViewDivision({ orgRole: 'ADMIN', divisionRole: null })).toBe(true);
  });

  it('lets only leads and admins manage a division', () => {
    expect(canManageDivision({ orgRole: 'DIVISION_LEAD', divisionRole: 'MEMBER' })).toBe(false);
    expect(canManageDivision({ orgRole: 'DIVISION_LEAD', divisionRole: 'LEAD' })).toBe(true);
    expect(canManageDivision({ orgRole: 'OWNER', divisionRole: null })).toBe(true);
  });

  it('requires the Division Lead org role to lead a division', () => {
    expect(canHoldDivisionRole('MEMBER', 'LEAD')).toBe(false);
    expect(canHoldDivisionRole('DIVISION_LEAD', 'LEAD')).toBe(true);
    expect(canHoldDivisionRole('GUEST', 'MEMBER')).toBe(false);
  });

  it('prevents guests from administering projects', () => {
    expect(canHoldProjectRole('GUEST', 'ADMIN')).toBe(false);
    expect(canHoldProjectRole('GUEST', 'MEMBER')).toBe(true);
  });
});
