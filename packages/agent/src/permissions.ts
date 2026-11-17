/**
 * Coarse capabilities an agent may be granted. They gate WHICH tools exist for a run; what a tool
 * may touch (which projects, which cards) is still enforced per call by the normal access layer.
 */
export const PERMISSIONS = {
  'tasks:read': 'Membaca task dan proyek yang bisa Anda akses',
  'cards:create': 'Mengusulkan kartu baru (menunggu konfirmasi)',
  'comments:write': 'Mengusulkan komentar di kartu (menunggu konfirmasi)',
  'web:read': 'Mencari dan membaca halaman web publik',
  'knowledge:read': 'Membaca dokumen knowledge base yang Anda boleh akses',
  'memory:write': 'Menyimpan dan membaca memori pribadi',
  'agents:delegate': 'Memberi tugas ke agent lain',
  'github:read': 'Membaca GitHub',
  'github:write': 'Mengusulkan pull request GitHub',
  'local:act': 'Mengusulkan aksi di komputer pemilik lewat aplikasi desktop (selalu butuh persetujuan)',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** New Personal Agents start with everyday permissions only; delegation and GitHub are opt-in. */
export const DEFAULT_DELEGATED: Permission[] = ['tasks:read', 'cards:create', 'comments:write', 'web:read', 'knowledge:read', 'memory:write'];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && value in PERMISSIONS;
}

export function sanitizePermissions(value: unknown): Permission[] {
  return Array.isArray(value) ? [...new Set(value.filter(isPermission))] : [];
}

/**
 * Personal Agent rule (playbook H8): effective permissions = the owner's CURRENT permissions ∩
 * what they delegated. Recomputed on every tool call, so revoking the owner's access (or the
 * delegation) takes effect immediately.
 */
export function effectivePermissions(ownerPermissions: Iterable<Permission>, delegated: Iterable<Permission>): Set<Permission> {
  const owner = new Set(ownerPermissions);
  return new Set([...delegated].filter((p) => owner.has(p)));
}
