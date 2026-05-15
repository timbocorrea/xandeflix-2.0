export type AdminRole = 'admin' | 'super_admin';

export type ClientStatus = 'active' | 'inactive' | 'expired' | 'blocked';

export type IptvSourceType = 'm3u' | 'xtream' | 'manual';

export interface AdminProfile {
  id: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: ClientStatus;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  client_id: string;
  device_name: string | null;
  device_identifier: string | null;
  platform: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IptvSource {
  id: string;
  client_id: string | null;
  name: string;
  source_url: string;
  type: IptvSourceType;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type LicenseStatus = 'active' | 'inactive' | 'expired' | 'blocked' | 'canceled';

export type LicensePlanType = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export interface License {
  id: string;
  license_code: string;
  label: string | null;
  status: LicenseStatus;
  plan_type: LicensePlanType;
  starts_at: string;
  expires_at: string | null;
  max_devices: number;
  max_concurrent_streams: number;
  allow_user_manage_sources: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseDevice {
  id: string;
  license_id: string;
  device_identifier: string;
  device_name: string | null;
  platform: string | null;
  manufacturer: string | null;
  model: string | null;
  app_version: string | null;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseIptvSource {
  id: string;
  license_id: string;
  name: string;
  source_url: string;
  type: IptvSourceType;
  is_active: boolean;
  created_by: 'admin' | 'user';
  created_at: string;
  updated_at: string;
}

export interface LicenseChannelCache {
  id: string;
  license_id: string;
  license_iptv_source_id: string;
  name: string;
  stream_url: string;
  logo_url: string | null;
  group_title: string | null;
  tvg_id: string | null;
  sort_order: number;
  is_active: boolean;
  last_imported_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlaybackSession {
  id: string;
  license_id: string;
  license_device_id: string | null;
  iptv_source_id: string | null;
  device_identifier: string;
  channel_name: string | null;
  stream_url: string | null;
  status: 'active' | 'ended' | 'expired';
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type AppInstallationStatus =
  | 'installed'
  | 'awaiting_activation'
  | 'activated'
  | 'inactive'
  | 'possibly_uninstalled'
  | 'pending_uninstall'
  | 'manually_marked_uninstalled'
  | 'blocked';

export interface AppInstallation {
  id: string;
  device_identifier: string;
  installation_status: AppInstallationStatus;
  platform: string | null;
  manufacturer: string | null;
  model: string | null;
  app_version: string | null;
  first_seen_at: string;
  last_seen_at: string;
  activated_at: string | null;
  pending_uninstall_at: string | null;
  manually_marked_uninstalled_at: string | null;
  linked_license_id: string | null;
  linked_license_device_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
