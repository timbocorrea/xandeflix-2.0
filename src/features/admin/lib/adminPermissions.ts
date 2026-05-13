import type { AdminProfile } from '../types/admin.types';

export type AdminPermission =
  | 'manage_admin_users'
  | 'view_audit_logs'
  | 'manage_all_clients'
  | 'manage_all_licenses';

export function isSuperAdmin(adminProfile: AdminProfile | null | undefined) {
  return adminProfile?.role === 'super_admin';
}

export function hasAdminPermission(
  adminProfile: AdminProfile | null | undefined,
  permission: AdminPermission,
) {
  if (!adminProfile?.is_active) {
    return false;
  }

  if (isSuperAdmin(adminProfile)) {
    return true;
  }

  switch (permission) {
    case 'manage_admin_users':
    case 'view_audit_logs':
    case 'manage_all_clients':
    case 'manage_all_licenses':
      return false;
    default:
      return false;
  }
}

export function canManageAdminUsers(
  adminProfile: AdminProfile | null | undefined,
) {
  return hasAdminPermission(adminProfile, 'manage_admin_users');
}

export function canViewAuditLogs(
  adminProfile: AdminProfile | null | undefined,
) {
  return hasAdminPermission(adminProfile, 'view_audit_logs');
}
