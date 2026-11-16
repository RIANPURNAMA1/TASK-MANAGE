import { describe, expect, it } from 'vitest';
import { canAssignOrgRole, isOrgAdmin, orgRoleAtLeast } from './roles';
import { sanitizeFileName } from './files';

describe('org roles', () => {
  it('ranks roles', () => {
    expect(orgRoleAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(orgRoleAtLeast('MEMBER', 'DIVISION_LEAD')).toBe(false);
    expect(orgRoleAtLeast('GUEST', 'MEMBER')).toBe(false);
  });

  it('identifies org admins', () => {
    expect(isOrgAdmin('OWNER')).toBe(true);
    expect(isOrgAdmin('ADMIN')).toBe(true);
    expect(isOrgAdmin('DIVISION_LEAD')).toBe(false);
  });

  it('prevents admins from creating peers or owners', () => {
    expect(canAssignOrgRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignOrgRole('ADMIN', 'OWNER')).toBe(false);
    expect(canAssignOrgRole('ADMIN', 'DIVISION_LEAD')).toBe(true);
    expect(canAssignOrgRole('OWNER', 'ADMIN')).toBe(true);
    expect(canAssignOrgRole('MEMBER', 'GUEST')).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('removes path traversal and control characters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFileName('a\u0000b.txt')).toBe('a_b.txt');
    expect(sanitizeFileName('...')).toBe('file');
  });
});
